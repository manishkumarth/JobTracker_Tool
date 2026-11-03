import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Switch,
} from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { listFollowUps, sendFollowUpEmail, createFollowUp, deleteFollowUp } from "../api/followups";
import { bulkSendFollowUps } from "../api/applications";
import { updateFeature } from "../api/settings";

const TABS = [
  { key: "overdue", label: "Overdue", badgeClass: "overdue" },
  { key: "today", label: "Today", badgeClass: "today" },
  { key: "upcoming", label: "Upcoming", badgeClass: "upcoming" },
  { key: "all", label: "All", badgeClass: "all" },
];

const TYPE_BADGE = {
  "Email Follow-up": "primary",
  email: "primary",
  call: "success",
  other: "neutral",
};

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
  const [autoSend, setAutoSend] = useState(user?.features?.autoFollowUp ?? true);
  const [sendingIds, setSendingIds] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const load = async () => {
    if (refreshing) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await listFollowUps({ scope: "all" });
      const list = Array.isArray(res) ? res : res.followups || res.items || [];
      setItems(list);
      // Refresh the flag from the latest user record
      const fresh = user?.features?.autoFollowUp;
      if (fresh !== undefined) setAutoSend(fresh);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const pendingItems = items.filter((f) => !f.emailSent);
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((f) => selectedIds.includes(f._id));

  const toggleAutoSend = async (v) => {
    setAutoSend(v);
    try {
      await updateFeature("autoFollowUp", v);
    } catch (e) {
      setAutoSend(!v);
      Alert.alert("Error", e?.response?.data?.message || "Could not update auto follow-ups");
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleSelectAllPending = () => {
    if (allPendingSelected) setSelectedIds([]);
    else setSelectedIds(pendingItems.map((f) => f._id));
  };

  const onSendOne = async (id) => {
    if (!user?.gmailConnected) {
      Alert.alert("Gmail required", "Connect Gmail in Profile first.");
      return;
    }
    setSendingIds((prev) => [...prev, id]);
    try {
      await sendFollowUpEmail(id);
      setItems((prev) =>
        prev.map((f) =>
          f._id === id ? { ...f, emailSent: true, status: "Completed" } : f
        )
      );
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      Alert.alert("Sent", "Follow-up email sent");
    } catch (e) {
      if (e?.response?.status === 409) {
        setItems((prev) =>
          prev.map((f) =>
            f._id === id ? { ...f, emailSent: true } : f
          )
        );
      }
      Alert.alert("Error", e?.response?.data?.message || "Failed to send follow-up");
    } finally {
      setSendingIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const onSendSelected = async () => {
    const targets = autoSend ? pendingItems.map((f) => f._id) : selectedIds;
    if (!targets.length) {
      return Alert.error(autoSend ? "No unsent follow-ups" : "Select at least one follow-up");
    }
    if (!user?.gmailConnected) return;
    setBulkSending(true);
    let ok = 0;
    for (const id of targets) {
      try {
        await sendFollowUpEmail(id);
        setItems((prev) =>
          prev.map((f) =>
            f._id === id ? { ...f, emailSent: true } : f
          )
        );
        ok++;
      } catch {
        /* already sent or failed */
      }
    }
    setBulkSending(false);
    setSelectedIds([]);
    if (ok > 0)
      Alert.success(`${ok} follow-up email${ok > 1 ? "s" : ""} sent`);
    else Alert.error("No follow-ups could be sent");
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const appEmailOf = (f) =>
    (f.application && typeof f.application === "object"
      ? f.application.hrEmail || ""
      : "") || f.hrEmail || "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 14,
          marginHorizontal: 16,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Follow-ups</Text>
          <Switch
            checked={autoSend}
            onValueChange={toggleAutoSend}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={autoSend ? colors.primary : "#cbd5e1"}
          />
          <Text style={{ color: autoSend ? colors.primary : colors.textMuted, fontSize: 12 }}>
            {autoSend ? "Auto send" : "Manual"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 8,
          marginHorizontal: 16,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", gap: 2 }}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: tab === t.key ? colors.primary : colors.border,
                backgroundColor: tab === t.key ? colors.primary + "18" : colors.card,
              }}
            >
              <Text style={{ color: tab === t.key ? colors.primary : colors.text, fontWeight: "600", fontSize: 12 }}>
                {t.label}
                <span style={{ marginLeft: 4, color: colors.textMuted, fontSize: 10 }}>
                  {counts[t.key] || 0}
                </span>
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Error */}
      {err ? (
        <Text style={{ color: colors.danger, paddingHorizontal: 16, marginBottom: 8 }}>
          {err}
        </Text>
      ) : null}

      {/* Send controls */}
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          marginHorizontal: 16,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {selectedIds.length} selected
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={toggleSelectAllPending}
              disabled={pendingItems.length === 0}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: pendingItems.length === 0 ? colors.border : colors.primary,
                backgroundColor: pendingItems.length === 0 ? colors.card : colors.primary + "18",
              }}
            >
              <Text style={{ color: pendingItems.length === 0 ? colors.textMuted : colors.primary, fontSize: 11 }}>
                Select all pending
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSendSelected}
              disabled={bulkSending || pendingItems.length === 0}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: bulkSending ? colors.primary + "99" : colors.primary,
              }}
            >
              {bulkSending ? (
                <Text style={{ color: "#fff", fontWeight: "600" }}>Sending...</Text>
              ) : (
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {autoSend ? "Send all unsent" : "Send selected"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Filtered list */}
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
          const catColor =
            cat === "overdue"
              ? "#dc2626"
              : cat === "today"
              ? "#d97706"
              : colors.textMuted;
          const app = item.application && typeof item.application === "object" ? item.application : null;
          const hrEmail = app?.hrEmail || item.hrEmail || "";
          const hrName = app?.hrName || item.hrName || "";
          const isSending = sendingIds.includes(item._id);
          const isSelected = selectedIds.includes(item._id);
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                gap: 6,
                backgroundColor: colors.card,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flexDirection: "column", gap: 2 }}>
                  <Text style={{ fontWeight: "600", color: colors.text, flexShrink: 1 }}>
                    {item.type || "Follow-up"}
                  </Text>
                  {item.type && item.type !== "General" && (
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>
                      · {item.type}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, color: colors.text }}>
                    {app?.jobTitle || item.application || "Application"}
                    {app?.companyName ? ` — ${app.companyName}` : ""}
                  </Text>
                  {app?.location ? (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {app.location}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexShrink: 0 }}>
                  <Text style={{ color: catColor, fontSize: 11, fontWeight: "600" }}>
                    Due: {due ? new Date(due).toLocaleString() : "—"} ({cat})
                  </Text>
                </View>
              </View>
              <hr style={{ borderColor: "#e5e7eb", margin: "8px 0" }} />
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {hrEmail ? (
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                    📧 {hrName ? hrName + " · " : ""}{hrEmail} {sent ? "· email sent" : ""}
                  </Text>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                    No recruiter email on file {sent ? "· email sent" : ""}
                  </Text>
                )}
                {item.note && !sent && !isSending && (
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                    · {item.note}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={sent || isSending}
                  onChange={() => toggleSelect(item._id)}
                  style={{ width: 18, height: 18, accentColor: colors.primary }}
                />
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                  {sent ? "Sent" : "Send"}
                </Text>
              </View>
              {!sent && !isSending ? (
                <TouchableOpacity
                  onPress={() => onSendOne(item._id)}
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    backgroundColor: colors.primary + "18",
                    borderWidth: 1,
                    borderColor: colors.primary,
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 10 }}>
                    Send
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 30 }}>
            No follow-ups in this tab
          </Text>
        }
      />
    </SafeAreaView>
  );
}