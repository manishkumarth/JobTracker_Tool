import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import {
  listFollowUps,
  completeFollowUp,
  cancelFollowUp,
  sendFollowUpEmail,
  deleteFollowUp,
} from "../../api/followups";
import { bulkSendFollowUps } from "../../api/applications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useFocusEffect, router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { updateFeature } from "../../api/settings";

const TABS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
];

function getDueCategory(dateStr) {
  if (!dateStr) return "upcoming";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "upcoming";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  if (d < todayStart) return "overdue";
  if (d >= todayStart && d < todayEnd) return "today";
  return "upcoming";
}

function dueDateOf(item) {
  return item.date || item.dueDate;
}

export default function FollowUps() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [autoFollowUp, setAutoFollowUp] = useState(user?.features?.autoFollowUp ?? true);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await listFollowUps({ scope: "all" });
      const list = Array.isArray(res) ? res : res.followups || res.items || [];
      setItems(list);
      // Refresh the flag from the latest user record
      const fresh = user?.features?.autoFollowUp;
      if (fresh !== undefined) setAutoFollowUp(fresh);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const toggleAutoFollowUp = async (v) => {
    setAutoFollowUp(v);
    try {
      await updateFeature("autoFollowUp", v);
    } catch (e) {
      setAutoFollowUp(!v);
      Alert.alert("Error", e?.response?.data?.message || "Could not update auto follow-ups");
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((f) => getDueCategory(dueDateOf(f)) === tab);
  }, [items, tab]);

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, upcoming: 0, all: items.length };
    items.forEach((f) => {
      c[getDueCategory(dueDateOf(f))]++;
    });
    return c;
  }, [items]);

  const onSend = async (id) => {
    if (!user?.gmailConnected) {
      Alert.alert("Gmail required", "Connect Gmail in Profile first.");
      return;
    }
    setSendingId(id);
    try {
      await sendFollowUpEmail(id);
      Alert.alert("Sent", "Follow-up email sent");
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setSendingId(null);
    }
  };

  const onAutoSendAll = () => {
    if (!user?.gmailConnected) {
      Alert.alert("Gmail required", "Connect Gmail in Profile first.");
      return;
    }
    const pending = items.filter((p) => !p.emailSent && p.status !== "COMPLETED" && p.status !== "CANCELLED");
    if (!pending.length) {
      Alert.alert("Nothing to send", "No pending follow-ups");
      return;
    }
    Alert.alert("Auto send", `Send AI follow-up to ${pending.length} pending?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send all",
        onPress: async () => {
          try {
            const appIds = pending.map((p) => p.application?._id || p.application).filter(Boolean);
            if (appIds.length) {
              await bulkSendFollowUps(appIds);
            } else {
              for (const p of pending) {
                await sendFollowUpEmail(p._id);
              }
            }
            Alert.alert("Done", "Follow-ups sent");
            await load();
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {!autoFollowUp ? (
        <View
          style={{
            backgroundColor: "#fef3c7",
            borderColor: "#f59e0b",
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
            marginHorizontal: 16,
            gap: 4,
          }}
        >
          <Text style={{ color: "#92400e", fontWeight: "600", fontSize: 13 }}>
            Auto follow-ups are disabled
          </Text>
          <Text style={{ color: "#92400e", fontSize: 12 }}>
            New follow-ups won't be auto-sent. Enable them in Profile → Follow-ups.
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Follow-ups</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => toggleAutoFollowUp(!autoFollowUp)}>
            <Text
              style={{
                color: autoFollowUp ? "#059669" : colors.textMuted,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              {autoFollowUp ? "Auto follow-ups ON" : "Auto follow-ups OFF"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAutoSendAll}>
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
              Auto send
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tab === t.key ? colors.primary : colors.border,
              backgroundColor: tab === t.key ? colors.primary + "18" : colors.card,
            }}
          >
            <Text style={{ color: tab === t.key ? colors.primary : colors.text, fontWeight: "600", fontSize: 13 }}>
              {t.label} ({counts[t.key] || 0})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const sent = item.emailSent || item.status === "COMPLETED";
          const due = dueDateOf(item);
          const cat = getDueCategory(due);
          const catColor = cat === "overdue" ? "#dc2626" : cat === "today" ? "#d97706" : colors.textMuted;
          const app = item.application && typeof item.application === "object" ? item.application : null;
          const hrEmail = app?.hrEmail || item.hrEmail || "";
          const hrName = app?.hrName || item.hrName || "";
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 14,
                gap: 7,
                backgroundColor: colors.card,
              }}
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: colors.text, flexShrink: 1 }}>
                  {item.type || "Follow-up"}
                </Text>
                {item.type && item.type !== "General" ? (
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>
                    · {item.type}
                  </Text>
                ) : null}
                {sent ? (
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: "600" }}>✓ Completed</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 13, color: colors.text }}>
                {app?.jobTitle || item.application || "Application"}
                {app?.companyName ? ` — ${app.companyName}` : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <Text style={{ color: catColor, fontSize: 12, fontWeight: "600" }}>
                  Due: {due ? new Date(due).toLocaleDateString() : "—"} ({cat})
                </Text>
                {due ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>· {new Date(due).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text> : null}
              </View>
              {hrEmail ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  📧 {hrName ? hrName + " · " : ""}{hrEmail} {sent ? "· email sent" : ""}
                </Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  No recruiter email on file {sent ? "· email sent" : ""}
                </Text>
              )}
              {item.note ? <Text style={{ color: colors.text, fontSize: 13 }}>{item.note}</Text> : null}
              {app?._id ? (
                <TouchableOpacity onPress={() => router.push(`/applications/${app._id}`)}>
                  <Text style={{ color: colors.primary, fontSize: 12 }}>Open application →</Text>
                </TouchableOpacity>
              ) : null}
              <View style={{ flexDirection: "row", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
                {!sent ? (
                  <TouchableOpacity onPress={() => onSend(item._id)} disabled={sendingId === item._id}>
                    {sendingId === item._id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: "600" }}>Send email</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {item.status !== "COMPLETED" ? (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await completeFollowUp(item._id);
                        await load();
                      } catch (e) {
                        Alert.alert("Error", e?.response?.data?.message || e.message);
                      }
                    }}
                  >
                    <Text style={{ color: colors.success || "#059669" }}>Complete</Text>
                  </TouchableOpacity>
                ) : null}
                {item.status !== "CANCELLED" && item.status !== "COMPLETED" ? (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await cancelFollowUp(item._id);
                        await load();
                      } catch (e) {
                        Alert.alert("Error", e?.response?.data?.message || e.message);
                      }
                    }}
                  >
                    <Text style={{ color: colors.danger }}>Cancel</Text>
                  </TouchableOpacity>
                ) : null}
                {app?._id ? (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await deleteFollowUp(item._id);
                        await load();
                      } catch (e) {
                        Alert.alert("Error", e?.response?.data?.message || e.message);
                      }
                    }}
                  >
                    <Text style={{ color: colors.danger, fontSize: 11 }}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 24 }}>
            No follow-ups in this tab
          </Text>
        }
      />
    </SafeAreaView>
  );
}
