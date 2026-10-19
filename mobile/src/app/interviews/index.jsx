import { View, Text, TouchableOpacity, Alert, Modal, TextInput, FlatList } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { listInterviews, deleteInterview, createInterview } from "../../api/interviews";
import { listApplications } from "../../api/applications";

export default function Interviews() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [apps, setApps] = useState([]);
  const [form, setForm] = useState({ application: "", interviewType: "Video", round: "Round 1", date: "", notes: "" });

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

  useEffect(() => {
    load();
  }, [load]);

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

  const onDelete = (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await deleteInterview(id); await load(); } catch (e) { Alert.alert("Error", e.message); } } },
    ]);
  };

  if (err) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Text style={{ color: "#dc2626" }}>{err}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Interviews</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity onPress={openCreate}>
            <Text style={{ color: "#2563eb", fontWeight: "600" }}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: "#2563eb" }}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item, i) => item._id || i.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 20 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 4 }}>
            <Text style={{ fontWeight: "600" }}>{item.interviewType} — {item.round}</Text>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>{item.date ? new Date(item.date).toLocaleString() : "-"}</Text>
            <Text style={{ color: "#374151", fontSize: 12 }}>Result: {item.result}</Text>
            {item.interviewer ? <Text style={{ color: "#6b7280" }}>Interviewer: {item.interviewer}</Text> : null}
            <TouchableOpacity onPress={() => onDelete(item._id)} style={{ marginTop: 4 }}>
              <Text style={{ color: "#dc2626" }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#6b7280", padding: 16 }}>No interviews scheduled</Text>}
      />

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 10 }}>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>Schedule Interview</Text>
            <Text style={{ fontWeight: "600", fontSize: 12, color: "#6b7280" }}>Application</Text>
            <FlatList
              data={apps}
              keyExtractor={(a) => a._id}
              style={{ maxHeight: 140 }}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setForm((f) => ({ ...f, application: item._id }))} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", backgroundColor: form.application === item._id ? "#eff6ff" : "transparent" }}>
                  <Text>{item.jobTitle} — {item.companyName}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ color: "#9ca3af", fontSize: 12 }}>No applications found</Text>}
            />
            <Text style={{ fontWeight: "600", fontSize: 12, color: "#6b7280" }}>Type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {["Phone", "Video", "Technical", "HR", "Managerial", "Assessment", "On-site"].map((t) => (
                <TouchableOpacity key={t} onPress={() => setForm((f) => ({ ...f, interviewType: t }))} style={{ padding: 6, borderRadius: 6, borderWidth: 1, borderColor: form.interviewType === t ? "#2563eb" : "#e5e7eb", backgroundColor: form.interviewType === t ? "#eff6ff" : "#fff" }}>
                  <Text style={{ color: form.interviewType === t ? "#2563eb" : "#374151", fontSize: 12 }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontWeight: "600", fontSize: 12, color: "#6b7280" }}>Round</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {["Round 1", "Round 2", "Round 3", "Final"].map((r) => (
                <TouchableOpacity key={r} onPress={() => setForm((f) => ({ ...f, round: r }))} style={{ padding: 6, borderRadius: 6, borderWidth: 1, borderColor: form.round === r ? "#2563eb" : "#e5e7eb", backgroundColor: form.round === r ? "#eff6ff" : "#fff" }}>
                  <Text style={{ color: form.round === r ? "#2563eb" : "#374151", fontSize: 12 }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput placeholder="Date & time (e.g. 2026-10-25 15:00)" value={form.date} onChangeText={(v) => setForm((f) => ({ ...f, date: v }))} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10 }} />
            <TextInput placeholder="Notes" value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, minHeight: 60, textAlignVertical: "top" }} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={onCreate} style={{ flex: 1, backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={{ flex: 1, borderWidth: 1, borderColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: "#2563eb", fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
