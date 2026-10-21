import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";

export default function Login() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onLogin = async () => {
    setErr("");
    if (!email || !password) return setErr("Email and password are required");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: "center",
        padding: 20,
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "700", textAlign: "center", color: colors.text }}>
        JobTrackr
      </Text>
      <Text style={{ textAlign: "center", color: colors.textMuted, marginBottom: 8 }}>
        Job Application CRM + AI Email Assistant
      </Text>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={input}
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={input}
        placeholderTextColor={colors.textMuted}
      />
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      <TouchableOpacity
        onPress={onLogin}
        disabled={loading}
        style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 8, alignItems: "center" }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "600" }}>Login</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/auth/signup")}>
        <Text style={{ textAlign: "center", color: colors.primary }}>
          Don't have an account? Sign Up
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
