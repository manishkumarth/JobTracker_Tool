import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";

export default function Signup() {
  const { signup } = useAuth();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSignup = async () => {
    setErr("");
    if (!name || !email || !password) return setErr("All fields are required");
    setLoading(true);
    try {
      await signup(name, email, password);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Signup failed");
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
        Create Account
      </Text>
      <TextInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
        style={input}
        placeholderTextColor={colors.textMuted}
      />
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
        onPress={onSignup}
        disabled={loading}
        style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 8, alignItems: "center" }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "600" }}>Sign Up</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/auth/login")}>
        <Text style={{ textAlign: "center", color: colors.primary }}>
          Already have an account? Login
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
