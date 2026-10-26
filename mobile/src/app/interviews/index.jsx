import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import {
  listInterviews,
  createInterview,
  updateInterview,
  deleteInterview,
} from "../../api/interviews";
import { listApplications } from "../../api/applications";
import { useTheme } from "../../context/ThemeContext";

const RESULTS = ["Scheduled", "Completed", "Passed", "Failed", "Rescheduled", "Cancelled"];
const RESULT_COLORS = {
  Scheduled: "#2563eb",
  Completed: "#6b7280",
  Passed: "#059669",
  Failed: "#dc2626",
  Rescheduled: "#d97706",
  Cancelled: "#6b7280",
};

export default function Interviews() {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [apps, setApps] = useState([]);
  const [form, setForm] = useState({
    application: "",
    interviewType: "Video",
    round: "Round 1",
    date: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await listInterviews();
      setItems(Array.isArray(res) ? res : res?.interviews || []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCreate = async () => {
    setShowCreate(true);
    try {
      const res = await listApplications({ limit: 100 });
      setApps(res?.applications || []);
    } catch {}
  };

  const onCreate = async () => {
    if (!form.application || !form.date) {
      Alert.alert("Required", "Pick an application and a date");
      return;
    }
    try {
      await createInterview(form);
      setShowCreate(false);
      setForm({ application: "", interviewType: "Video", round: "Round 1", date: "", notes: "" });
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const setResult = async (id, result) => {
    try {
      await updateInterview(id, { result });
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onDelete = (id) => {
    Alert.alert("Delete", "Delete this interview?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteInterview(id);
            await load();
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Interviews</Text>
        <TouchableOpacity onPress={openCreate}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Add</Text>
        </TouchableOpacity>
      </View>

      {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item, i) => item._id || String(i)}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 24 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const result = item.result || "Scheduled";
          const rc = RESULT_COLORS[result] || colors.textMuted;
          const title = item.application?.jobTitle || item.jobTitle || "Interview";
          const company = item.application?.company?.name || item.application?.companyName || "";
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
              <Text style={{ fontWeight: "600", color: colors.text }}>
                {title}
                {company ? ` · ${company}` : ""}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.interviewType || "—"}
                {item.round ? ` · ${item.round}` : ""}
              </Text>
              <Text style={{ color: colors.text, fontSize: 13 }}>
                {item.date ? new Date(item.date).toLocaleString() : "—"}
              </Text>
              {item.interviewer ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Interviewer: {item.interviewer}</Text>
              ) : null}
              <Text style={{ color: rc, fontWeight: "600", fontSize: 12 }}>Result: {result}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {RESULTS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setResult(item._id, r)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: result === r ? rc : colors.border,
                      backgroundColor: result === r ? rc + "22" : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 11, color: result === r ? rc : colors.textMuted, fontWeight: "600" }}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {item.application?._id ? (
                <TouchableOpacity onPress={() => router.push(`/applications/${item.application._id}`)}>
                  <Text style={{ color: colors.primary, fontSize: 12 }}>Open application →</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => onDelete(item._id)}>
                <Text style={{ color: colors.danger, fontSize: 12 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 24 }}>
            No interviews scheduled
          </Text>
        }
      />

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 10, maxHeight: "90%" }}>
            <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>Schedule Interview</Text>
            <Text style={{ fontWeight: "600", fontSize: 12, color: colors.textMuted }}>Application</Text>
            <FlatList
              data={apps}
              keyExtractor={(a) => a._id}
              style={{ maxHeight: 120 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => setForm((f) => ({ ...f, application: item._id }))}
                  style={{
                    padding: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: form.application === item._id ? colors.primary + "18" : "transparent",
                  }}
                >
                  <Text style={{ color: colors.text }}>
                    {item.jobTitle} — {item.companyName}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>No applications found</Text>
              }
            />
            <Text style={{ fontWeight: "600", fontSize: 12, color: colors.textMuted }}>Type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {["Phone", "Video", "Technical", "HR", "Managerial", "Assessment", "On-site"].map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setForm((f) => ({ ...f, interviewType: t }))}
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: form.interviewType === t ? colors.primary : colors.border,
                    backgroundColor: form.interviewType === t ? colors.primary + "18" : colors.bg,
                  }}
                >
                  <Text
                    style={{
                      color: form.interviewType === t ? colors.primary : colors.text,
                      fontSize: 12,
                    }}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontWeight: "600", fontSize: 12, color: colors.textMuted }}>Round</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {["Round 1", "Round 2", "Round 3", "Final"].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setForm((f) => ({ ...f, round: r }))}
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: form.round === r ? colors.primary : colors.border,
                    backgroundColor: form.round === r ? colors.primary + "18" : colors.bg,
                  }}
                >
                  <Text style={{ color: form.round === r ? colors.primary : colors.text, fontSize: 12 }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              placeholder="Date & time (e.g. 2026-10-25 15:00)"
              placeholderTextColor={colors.textMuted}
              value={form.date}
              onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10,
                color: colors.text,
                backgroundColor: colors.bg,
              }}
            />
            <TextInput
              placeholder="Notes"
              placeholderTextColor={colors.textMuted}
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              multiline
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10,
                minHeight: 60,
                textAlignVertical: "top",
                color: colors.text,
                backgroundColor: colors.bg,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={onCreate}
                style={{
                  flex: 1,
                  backgroundColor: colors.primary,
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCreate(false)}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
