import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import {
  listEmails,
  getEmail,
  getEmailTrackingStats,
  getEmailThread,
  replyToEmail,
} from "../../api/emails";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

const STATUSES = ["", "Draft", "Pending", "Sent", "Failed"];

export default function Emails() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [thread, setThread] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await listEmails({
        search: search.trim() || undefined,
        status: status || undefined,
        limit: 50,
      });
      const list = Array.isArray(res) ? res : res.emails || [];
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
    }, [status])
  );

  const openEmail = async (item) => {
    setSelected(item);
    setTracking(null);
    setThread(null);
    setReplyBody("");
    setDetailLoading(true);
    try {
      const full = await getEmail(item._id).catch(() => item);
      setSelected(full.email || full);
      try {
        const stats = await getEmailTrackingStats(item._id);
        setTracking(stats);
      } catch {}
      try {
        const th = await getEmailThread(item._id);
        setThread(th.thread || th.messages || th || null);
      } catch {}
    } finally {
      setDetailLoading(false);
    }
  };

  const sendReply = async () => {
    if (!user?.gmailConnected) {
      Alert.alert("Gmail required", "Connect Gmail in Profile first.");
      return;
    }
    if (!replyBody.trim()) {
      Alert.alert("Required", "Write a reply first");
      return;
    }
    setReplyBusy(true);
    try {
      await replyToEmail({
        emailId: selected._id,
        message: replyBody.trim(),
      });
      Alert.alert("Sent", "Reply sent");
      setReplyBody("");
      await openEmail(selected);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setReplyBusy(false);
    }
  };

  const statusColor = (s) => {
    if (s === "Sent") return "#059669";
    if (s === "Failed") return "#dc2626";
    if (s === "Pending") return "#d97706";
    return colors.textMuted;
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
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Email History</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load()}
          placeholder="Search subject or recipient"
          placeholderTextColor={colors.textMuted}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            padding: 10,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s || "all"}
              onPress={() => setStatus(s)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: status === s ? colors.primary : colors.border,
                backgroundColor: status === s ? colors.primary + "18" : colors.card,
              }}
            >
              <Text style={{ color: status === s ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>
                {s || "All"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => openEmail(item)}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
              backgroundColor: colors.card,
              gap: 4,
            }}
          >
            <Text style={{ fontWeight: "600", color: colors.text }} numberOfLines={1}>
              {item.subject || "(no subject)"}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
              To: {item.recipientEmail || item.to || "—"}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: statusColor(item.status), fontSize: 12, fontWeight: "600" }}>
                {item.status || "—"}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
              </Text>
            </View>
            {item.emailType ? (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.emailType}</Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 24 }}>No emails yet</Text>
        }
      />

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={{ color: colors.primary }}>Close</Text>
            </TouchableOpacity>
            <Text style={{ fontWeight: "700", color: colors.text }}>Email</Text>
            <View style={{ width: 40 }} />
          </View>
          {detailLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : selected ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                {selected.subject || "(no subject)"}
              </Text>
              <Text style={{ color: colors.textMuted }}>
                To: {selected.recipientEmail || selected.to || "—"}
              </Text>
              <Text style={{ color: statusColor(selected.status), fontWeight: "600" }}>
                {selected.status} {selected.emailType ? `· ${selected.emailType}` : ""}
              </Text>
              {tracking ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 10,
                    backgroundColor: colors.card,
                    gap: 4,
                  }}
                >
                  <Text style={{ fontWeight: "600", color: colors.text }}>Tracking</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Opens: {tracking.opens ?? tracking.openCount ?? 0} · Clicks:{" "}
                    {tracking.clicks ?? tracking.clickCount ?? 0}
                  </Text>
                </View>
              ) : null}
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                  {selected.message || selected.body || selected.html || "(empty body)"}
                </Text>
              </View>
              {Array.isArray(thread) && thread.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>Thread</Text>
                  {thread.map((m, idx) => (
                    <View
                      key={m._id || idx}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: colors.card,
                      }}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {m.direction || m.from || ""} {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                      </Text>
                      <Text style={{ color: colors.text, marginTop: 4 }}>
                        {m.message || m.body || m.subject || ""}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={{ fontWeight: "700", color: colors.text }}>Reply</Text>
              <TextInput
                value={replyBody}
                onChangeText={setReplyBody}
                multiline
                placeholder="Write a reply..."
                placeholderTextColor={colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  minHeight: 100,
                  color: colors.text,
                  backgroundColor: colors.card,
                  textAlignVertical: "top",
                }}
              />
              <TouchableOpacity
                onPress={sendReply}
                disabled={replyBusy}
                style={{
                  backgroundColor: colors.primary,
                  padding: 14,
                  borderRadius: 8,
                  alignItems: "center",
                  opacity: replyBusy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {replyBusy ? "Sending..." : "Send reply"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
