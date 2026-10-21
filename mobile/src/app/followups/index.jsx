import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useState, useCallback } from "react";
import {
  listFollowUps,
  completeFollowUp,
  cancelFollowUp,
  sendFollowUpEmail,
} from "../../api/followups";
import { bulkSendFollowUps } from "../../api/applications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useFocusEffect, router } from "expo-router";
import { useAuth } from "../../context/AuthContext";

export default function FollowUps() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [sendingId, setSendingId] = useState(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await listFollowUps();
      const list = Array.isArray(res) ? res : res.followups || res.items || [];
      setItems(list);
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
    const pending = items.filter((i) => !i.emailSent && i.status !== "COMPLETED" && i.status !== "CANCELLED");
    if (!pending.length) {
      Alert.alert("None", "No pending follow-ups to send");
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
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Follow-ups</Text>
        <TouchableOpacity onPress={onAutoSendAll}>
          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Auto send</Text>
        </TouchableOpacity>
      </View>
      {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const sent = item.emailSent || item.status === "COMPLETED";
          return (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 14,
                gap: 6,
                backgroundColor: colors.card,
              }}
            >
              <Text style={{ fontWeight: "600", color: colors.text }}>
                {item.type || "Follow-up"}
                {item.application?.jobTitle ? ` — ${item.application.jobTitle}` : ""}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}
              </Text>
              {item.note ? <Text style={{ color: colors.text, fontSize: 13 }}>{item.note}</Text> : null}
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Status: {item.status} {sent ? "· Email sent" : ""}
              </Text>
              <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
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
                    <Text style={{ color: colors.success }}>Complete</Text>
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
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 24 }}>
            No follow-ups scheduled
          </Text>
        }
      />
    </SafeAreaView>
  );
}
