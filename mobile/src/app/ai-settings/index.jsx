import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  getProviders,
  saveProvider,
  deleteProvider,
  activateProvider,
  testProvider,
} from "../../api/settings";
import { useTheme } from "../../context/ThemeContext";

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
  const { colors } = useTheme();
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
    if (!form.provider || !form.apiKey.trim()) {
      Alert.alert("Required", "Pick a provider and enter an API key");
      return;
    }
    try {
      await saveProvider({ provider: form.provider, apiKey: form.apiKey.trim() });
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
      Alert.alert("Test", res?.ok || res?.success ? "Connection OK" : res?.message || "Test completed");
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
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>AI Settings</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          Configure an LLM provider for AI email generation, LinkedIn parsing, and HR replies. Keys stay on the server.
        </Text>

        <Text style={{ fontWeight: "600", color: colors.text }}>Add provider</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Provider</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {Object.keys(PROVIDER_LABELS).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setForm((f) => ({ ...f, provider: p }))}
              style={{
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: form.provider === p ? colors.primary : colors.border,
                backgroundColor: form.provider === p ? colors.primary + "18" : colors.card,
              }}
            >
              <Text
                style={{
                  color: form.provider === p ? colors.primary : colors.text,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {PROVIDER_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          placeholder="API Key"
          placeholderTextColor={colors.textMuted}
          value={form.apiKey}
          onChangeText={(v) => setForm((f) => ({ ...f, apiKey: v }))}
          secureTextEntry
          autoCapitalize="none"
          style={inputStyle}
        />
        <TouchableOpacity
          onPress={onSave}
          style={{ backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Save provider</Text>
        </TouchableOpacity>

        <Text style={{ fontWeight: "600", color: colors.text, marginTop: 8 }}>Saved providers</Text>
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        {providers.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No providers configured yet</Text>
        ) : null}
        {providers.map((p) => (
          <View
            key={p.provider}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
              gap: 8,
              backgroundColor: colors.card,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "600", color: colors.text }}>
                {PROVIDER_LABELS[p.provider] || p.provider}
              </Text>
              {p.isActive ? (
                <Text style={{ color: "#059669", fontSize: 12, fontWeight: "700" }}>ACTIVE</Text>
              ) : null}
            </View>
            {p.model ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Model: {p.model}</Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
              <TouchableOpacity onPress={() => onTest(p.provider, p.apiKey)} disabled={testing}>
                {testing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>Test</Text>
                )}
              </TouchableOpacity>
              {!p.isActive ? (
                <TouchableOpacity onPress={() => onActivate(p.provider)}>
                  <Text style={{ color: "#059669", fontWeight: "600" }}>Activate</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => onDelete(p.provider)}>
                <Text style={{ color: colors.danger, fontWeight: "600" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
