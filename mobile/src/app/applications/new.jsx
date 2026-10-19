import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useState } from "react";
import { createApplication } from "../../api/applications";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NewApplication() {
  const [form, setForm] = useState({
    jobTitle: "",
    companyName: "",
    jobDescription: "",
    location: "",
    jobUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSave = async () => {
    setErr("");
    if (!form.jobTitle || !form.companyName) return setErr("Job title and company name are required");
    setLoading(true);
    try {
      await createApplication(form);
      router.replace("/(tabs)/applications");
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>New Application</Text>
        <TextInput placeholder="Job Title" value={form.jobTitle} onChangeText={(v) => set("jobTitle", v)} style={input} />
        <TextInput placeholder="Company Name" value={form.companyName} onChangeText={(v) => set("companyName", v)} style={input} />
        <TextInput placeholder="Location" value={form.location} onChangeText={(v) => set("location", v)} style={input} />
        <TextInput placeholder="Job URL" value={form.jobUrl} onChangeText={(v) => set("jobUrl", v)} autoCapitalize="none" style={input} />
        <TextInput placeholder="Job Description" value={form.jobDescription} onChangeText={(v) => set("jobDescription", v)} multiline numberOfLines={6} style={[input, { height: 120, textAlignVertical: "top" }]} />
        {err ? <Text style={{ color: "#dc2626" }}>{err}</Text> : null}
        <TouchableOpacity onPress={onSave} disabled={loading} style={btn}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={btnText}>Save</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={btnOutline}>
          <Text style={btnOutlineText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
const btnOutline = { borderColor: "#2563eb", borderWidth: 1, padding: 12, borderRadius: 8, alignItems: "center" };
const btnOutlineText = { color: "#2563eb", fontWeight: "600" };
