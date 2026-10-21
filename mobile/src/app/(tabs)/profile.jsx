import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "../../api/profile";
import { listResumes, uploadResume, setDefaultResume, updateResume, deleteResume } from "../../api/resumes";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function ProfileScreen() {
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [profile, setProfile] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    phone: "",
    skills: "",
    summary: "",
    experience: "",
    projects: "",
    masterPrompt: "",
  });
  const [notes, setNotes] = useState({});
  const [gmailAddress, setGmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [gmailBusy, setGmailBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const p = await getProfile();
      setProfile(p);
      setForm({
        phone: p?.phone || "",
        skills: Array.isArray(p?.skills) ? p.skills.join(", ") : "",
        summary: p?.summary || "",
        experience: p?.experience || "",
        projects: p?.projects || "",
        masterPrompt: p?.masterPrompt || "",
      });
      const r = await listResumes();
      setResumes(r.resumes || r || []);
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
        phone: form.phone,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        summary: form.summary,
        experience: form.experience,
        projects: form.projects,
        masterPrompt: form.masterPrompt,
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
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const file = res.assets[0];
      await uploadResume({
        uri: file.uri,
        name: file.name || "resume.pdf",
        type: file.mimeType || "application/pdf",
      });
      Alert.alert("Uploaded", "Resume uploaded");
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const connectGmail = async () => {
    if (!gmailAddress.trim() || !appPassword.trim()) {
      Alert.alert("Required", "Enter Gmail address and App Password");
      return;
    }
    setGmailBusy(true);
    try {
      await api.post("/auth/connect-gmail", {
        gmailAddress: gmailAddress.trim(),
        appPassword: appPassword.trim(),
      });
      Alert.alert("Connected", "Gmail connected successfully");
      setAppPassword("");
      await refreshUser();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setGmailBusy(false);
    }
  };

  const disconnectGmail = async () => {
    setGmailBusy(true);
    try {
      await api.post("/auth/disconnect-gmail");
      Alert.alert("Disconnected", "Gmail disconnected");
      await refreshUser();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setGmailBusy(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
  };
  const label = { color: colors.textMuted, fontSize: 12, marginBottom: 4 };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (err) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 16, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.danger }}>{err}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Candidate Profile</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          The AI only uses facts from this profile. Never invent skills or experience.
        </Text>

        <Text style={label}>Name</Text>
        <TextInput
          value={user?.name || ""}
          editable={false}
          style={[inputStyle, { opacity: 0.7 }]}
        />
        <Text style={label}>Email</Text>
        <TextInput
          value={user?.email || ""}
          editable={false}
          style={[inputStyle, { opacity: 0.7 }]}
        />
        <Text style={label}>Phone</Text>
        <TextInput
          placeholder="Phone"
          value={form.phone}
          onChangeText={(v) => set("phone", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
        />
        <Text style={label}>Skills (comma separated)</Text>
        <TextInput
          placeholder="React, Node.js, MongoDB, ..."
          value={form.skills}
          onChangeText={(v) => set("skills", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={label}>Summary</Text>
        <TextInput
          placeholder="Professional summary"
          value={form.summary}
          onChangeText={(v) => set("summary", v)}
          multiline
          numberOfLines={4}
          style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={label}>Experience</Text>
        <TextInput
          placeholder="Years / key roles (AI will only use what you write)"
          value={form.experience}
          onChangeText={(v) => set("experience", v)}
          multiline
          numberOfLines={4}
          style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={label}>Projects</Text>
        <TextInput
          placeholder="Notable projects"
          value={form.projects}
          onChangeText={(v) => set("projects", v)}
          multiline
          numberOfLines={4}
          style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={label}>Master Prompt (appended to every AI email)</Text>
        <TextInput
          placeholder='e.g. always sign off as "Thanks, YourName"'
          value={form.masterPrompt}
          onChangeText={(v) => set("masterPrompt", v)}
          multiline
          numberOfLines={3}
          style={[inputStyle, { height: 80, textAlignVertical: "top" }]}
          placeholderTextColor={colors.textMuted}
        />

        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 8, alignItems: "center" }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "600" }}>Save Profile</Text>
          )}
        </TouchableOpacity>

        {/* Gmail */}
        <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 16, color: colors.text }}>
          Gmail Connection
        </Text>
        {user?.gmailConnected ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 14,
              backgroundColor: colors.card,
              gap: 8,
            }}
          >
            <Text style={{ color: colors.success, fontWeight: "600" }}>Gmail Connected</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Sending from {user.gmailAddress || "your Gmail"}
            </Text>
            <TouchableOpacity
              onPress={disconnectGmail}
              disabled={gmailBusy}
              style={{
                borderWidth: 1,
                borderColor: colors.danger,
                padding: 10,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              {gmailBusy ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={{ color: colors.danger, fontWeight: "600" }}>Disconnect</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 14,
              backgroundColor: colors.card,
              gap: 10,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Use a Gmail App Password (Google Account → Security → 2-Step Verification → App passwords). Your normal password will not work.
            </Text>
            <TextInput
              placeholder="you@gmail.com"
              value={gmailAddress}
              onChangeText={setGmailAddress}
              autoCapitalize="none"
              keyboardType="email-address"
              style={inputStyle}
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              placeholder="16-character app password"
              value={appPassword}
              onChangeText={setAppPassword}
              secureTextEntry
              autoCapitalize="none"
              style={inputStyle}
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity
              onPress={connectGmail}
              disabled={gmailBusy}
              style={{ backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center" }}
            >
              {gmailBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "600" }}>Connect Gmail</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Resumes */}
        <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 16, color: colors.text }}>
          Resumes
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Tag each resume with roles it fits (e.g. "React Developer, Frontend"). Auto-selection matches job keywords against filename + notes.
        </Text>
        <TouchableOpacity
          onPress={onUpload}
          style={{
            borderColor: colors.primary,
            borderWidth: 1,
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Upload Resume (PDF)</Text>
        </TouchableOpacity>
        {resumes.map((r) => (
          <View
            key={r._id}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 12,
              gap: 6,
              backgroundColor: colors.card,
            }}
          >
            <Text style={{ fontWeight: "600", color: colors.text }}>{r.originalName}</Text>
            {r.isDefault ? (
              <Text style={{ color: colors.success, fontSize: 12 }}>Default</Text>
            ) : null}
            <TextInput
              placeholder="Role notes for auto-matching"
              value={notes[r._id] ?? r.notes ?? ""}
              onChangeText={(v) => setNotes((n) => ({ ...n, [r._id]: v }))}
              style={inputStyle}
              placeholderTextColor={colors.textMuted}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await updateResume(r._id, { notes: notes[r._id] ?? r.notes });
                    Alert.alert("Saved");
                    await load();
                  } catch (e) {
                    Alert.alert("Error", e?.response?.data?.message || e.message);
                  }
                }}
              >
                <Text style={{ color: colors.primary }}>Save Notes</Text>
              </TouchableOpacity>
              {!r.isDefault ? (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await setDefaultResume(r._id);
                      await load();
                    } catch (e) {
                      Alert.alert("Error", e?.response?.data?.message || e.message);
                    }
                  }}
                >
                  <Text style={{ color: colors.primary }}>Set Default</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await deleteResume(r._id);
                    await load();
                  } catch (e) {
                    Alert.alert("Error", e?.response?.data?.message || e.message);
                  }
                }}
              >
                <Text style={{ color: colors.danger }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
