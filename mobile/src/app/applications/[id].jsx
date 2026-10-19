import { View, Text, ScrollView, ActivityIndicator, TextInput, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { getApplication, addNote, changeStatus, deleteApplication, APPLICATION_STATUSES } from "../../api/applications";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ApplicationDetail() {
  const { id } = useLocalSearchParams();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await getApplication(id);
      setApp(res);
      setStatus(res.status);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAddNote = async () => {
    if (!note.trim()) return;
    try {
      await addNote(id, note.trim());
      setNote("");
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onChangeStatus = async () => {
    if (!status) return;
    try {
      await changeStatus(id, status);
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onDelete = async () => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteApplication(id);
            router.replace("/(tabs)/applications");
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (err || !app) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Text style={{ color: "#dc2626" }}>{err || "Not found"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>{app.jobTitle}</Text>
        <Text style={{ color: "#6b7280" }}>{app.companyName}</Text>
        <Text style={{ color: "#374151" }}>Status: {app.status}</Text>
        <Text style={{ color: "#6b7280" }}>Location: {app.location || "-"}</Text>
        <Text style={{ color: "#6b7280" }}>URL: {app.jobUrl || "-"}</Text>
        {app.jobDescription ? <Text style={{ color: "#374151", lineHeight: 20 }}>{app.jobDescription}</Text> : null}

        <Text style={{ fontWeight: "600", marginTop: 8 }}>Update Status</Text>
        <TextInput value={status} onChangeText={setStatus} placeholder="e.g. APPLIED" style={input} />
        <TouchableOpacity onPress={onChangeStatus} style={btn}>
          <Text style={btnText}>Update Status</Text>
        </TouchableOpacity>

        <Text style={{ fontWeight: "600", marginTop: 8 }}>Add Note</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="Note" multiline numberOfLines={4} style={[input, { height: 80, textAlignVertical: "top" }]} />
        <TouchableOpacity onPress={onAddNote} style={btn}>
          <Text style={btnText}>Add Note</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onDelete} style={[btnOutline, { borderColor: "#dc2626" }]}>
          <Text style={[btnOutlineText, { color: "#dc2626" }]}>Delete Application</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={btnOutline}>
          <Text style={btnOutlineText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
const btnOutline = { borderColor: "#2563eb", borderWidth: 1, padding: 10, borderRadius: 8, alignItems: "center", marginTop: 4 };
const btnOutlineText = { color: "#2563eb", fontWeight: "600" };
