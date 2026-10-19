import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Switch } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getProviders, saveProvider, deleteProvider, activateProvider, testProvider } from "../../api/settings";

const PROVIDER_LABELS = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
  groq: "Groq",
  deepseek: "DeepSeek",
  together: "Together AI",
};

export default function AISettings() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ provider: "openrouter", apiKey: "" });
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await getProviders();
      setProviders(Array.isArray(res) ? res : res?.providers || []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async () => {
    if (!form.provider || !form.apiKey) {
      Alert.alert("Required", "Pick a provider and enter an API key");
      return;
    }
    try {
      await saveProvider(form);
      setForm({ provider: "openrouter", apiKey: "" });
      await load();
      Alert.alert("Saved", "Provider saved");
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onTest = async (provider, apiKey) => {
    setTesting(true);
    try {
      const res = await testProvider(provider, apiKey);
      Alert.alert("Test", res?.ok ? "Connection OK" : res?.message || "Test failed");
    } catch (e) {
      Alert.alert("Test failed", e?.response?.data?.message || e.message);
    } finally {
      setTesting(false);
    }
  };

  const onActivate = async (provider) => {
    try {
      await activateProvider(provider);
      await load();
      Alert.alert("Activated", `${PROVIDER_LABELS[provider] || provider} is now active`);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onDelete = (provider) => {
    Alert.alert("Delete", `Remove ${PROVIDER_LABELS[provider] || provider}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProvider(provider);
            await load();
          } catch (e) {
            Alert.alert("Error", e.message);
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>AI Settings</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: "#2563eb" }}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontWeight: "600" }}>Add Provider</Text>
        <Text style={{ color: "#6b7280", fontSize: 12, marginTop: -8 }}>Provider</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {Object.keys(PROVIDER_LABELS).map((p) => (
            <TouchableOpacity key={p} onPress={() => setForm((f) => ({ ...f, provider: p }))} style={{ padding: 6, borderRadius: 6, borderWidth: 1, borderColor: form.provider === p ? "#2563eb" : "#e5e7eb", backgroundColor: form.provider === p ? "#eff6ff" : "#fff" }}>
              <Text style={{ color: form.provider === p ? "#2563eb" : "#374151", fontSize: 12 }}>{PROVIDER_LABELS[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput placeholder="API Key" value={form.apiKey} onChangeText={(v) => setForm((f) => ({ ...f, apiKey: v }))} secureTextEntry autoCapitalize="none" style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 }} />
        <TouchableOpacity onPress={onSave} style={{ backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Save Provider</Text>
        </TouchableOpacity>

        <Text style={{ fontWeight: "600", marginTop: 12 }}>Saved Providers</Text>
        {err ? <Text style={{ color: "#dc2626" }}>{err}</Text> : null}
        {providers.length === 0 ? <Text style={{ color: "#6b7280" }}>No providers configured</Text> : null}
        {providers.map((p) => (
          <View key={p.provider} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "600" }}>{PROVIDER_LABELS[p.provider] || p.provider}</Text>
              {p.isActive ? <Text style={{ color: "#059669", fontSize: 12 }}>ACTIVE</Text> : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <TouchableOpacity onPress={() => onTest(p.provider, p.apiKey)} disabled={testing}>
                {testing ? <ActivityIndicator size="small" /> : <Text style={{ color: "#2563eb" }}>Test</Text>}
              </TouchableOpacity>
              {!p.isActive ? (
                <TouchableOpacity onPress={() => onActivate(p.provider)}>
                  <Text style={{ color: "#059669" }}>Activate</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => onDelete(p.provider)}>
                <Text style={{ color: "#dc2626" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
