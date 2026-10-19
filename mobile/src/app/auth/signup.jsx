import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Signup() {
  const { signup } = useAuth();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", textAlign: "center" }}>Create Account</Text>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={input} />
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={input} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={input} />
      {err ? <Text style={{ color: "#dc2626" }}>{err}</Text> : null}
      <TouchableOpacity onPress={onSignup} disabled={loading} style={btn}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={btnText}>Sign Up</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/auth/login")}>
        <Text style={{ textAlign: "center", color: "#2563eb" }}>Already have an account? Login</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
