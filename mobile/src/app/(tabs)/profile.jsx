import { View, Text, ScrollView, ActivityIndicator, TextInput, TouchableOpacity, Alert, Image } from "react-native";
import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "../../api/profile";
import { listResumes, uploadResume, setDefaultResume, updateResume, deleteResume } from "../../api/resumes";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";

export default function ProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", skills: "", summary: "" });
  const [notes, setNotes] = useState({});

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const p = await getProfile();
      setProfile(p);
      setForm({
        name: p?.user?.name || "",
        email: p?.user?.email || "",
        phone: p?.phone || "",
        skills: Array.isArray(p?.skills) ? p.skills.join(", ") : "",
        summary: p?.summary || "",
      });
      const r = await listResumes();
      setResumes(r.resumes || []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        ...profile,
        phone: form.phone,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        summary: form.summary,
      });
      await load();
      Alert.alert("Saved", "Profile updated");
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled) return;
      const file = res.assets[0];
      await uploadResume({ uri: file.uri, name: file.name || "resume.pdf", type: file.mimeType || "application/pdf" });
      Alert.alert("Uploaded", "Resume uploaded");
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (err) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Text style={{ color: "#dc2626" }}>{err}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Profile</Text>
        <TextInput placeholder="Name" value={form.name} editable={false} style={[input, { backgroundColor: "#f9fafb" }]} />
        <TextInput placeholder="Email" value={form.email} editable={false} style={[input, { backgroundColor: "#f9fafb" }]} />
        <TextInput placeholder="Phone" value={form.phone} onChangeText={(v) => set("phone", v)} style={input} />
        <TextInput placeholder="Skills (comma separated)" value={form.skills} onChangeText={(v) => set("skills", v)} style={input} />
        <TextInput placeholder="Summary" value={form.summary} onChangeText={(v) => set("summary", v)} multiline numberOfLines={5} style={[input, { height: 100, textAlignVertical: "top" }]} />
        <TouchableOpacity onPress={onSave} disabled={saving} style={btn}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={btnText}>Save Profile</Text>}
        </TouchableOpacity>

        <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 12 }}>Resumes</Text>
        <TouchableOpacity onPress={onUpload} style={btnOutline}>
          <Text style={btnOutlineText}>Upload Resume (PDF)</Text>
        </TouchableOpacity>
        {resumes.map((r) => (
          <View key={r._id} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 6 }}>
            <Text style={{ fontWeight: "600" }}>{r.originalName}</Text>
            {r.isDefault ? <Text style={{ color: "#059669" }}>Default</Text> : null}
            <TextInput placeholder="Notes (for auto-resume matching)" value={notes[r._id] ?? r.notes ?? ""} onChangeText={(v) => setNotes((n) => ({ ...n, [r._id]: v }))} style={input} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity onPress={async () => { try { await updateResume(r._id, { notes: notes[r._id] ?? r.notes }); Alert.alert("Saved"); await load(); } catch (e) { Alert.alert("Error", e.message); } }}>
                <Text style={{ color: "#2563eb" }}>Save Notes</Text>
              </TouchableOpacity>
              {!r.isDefault ? (
                <TouchableOpacity onPress={async () => { try { await setDefaultResume(r._id); await load(); } catch (e) { Alert.alert("Error", e.message); } }}>
                  <Text style={{ color: "#2563eb" }}>Set as Default</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={async () => { try { await deleteResume(r._id); await load(); } catch (e) { Alert.alert("Error", e.message); } }}>
                <Text style={{ color: "#dc2626" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
const btnOutline = { borderColor: "#2563eb", borderWidth: 1, padding: 12, borderRadius: 8, alignItems: "center" };
const btnOutlineText = { color: "#2563eb", fontWeight: "600" };
