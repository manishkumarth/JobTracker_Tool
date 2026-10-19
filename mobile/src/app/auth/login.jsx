import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Login() {
  const { login } = useAuth();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", textAlign: "center" }}>JobTrackr</Text>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={input} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={input} />
      {err ? <Text style={{ color: "#dc2626" }}>{err}</Text> : null}
      <TouchableOpacity onPress={onLogin} disabled={loading} style={btn}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={btnText}>Login</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/auth/signup")}>
        <Text style={{ textAlign: "center", color: "#2563eb" }}>Don't have an account? Sign Up</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
