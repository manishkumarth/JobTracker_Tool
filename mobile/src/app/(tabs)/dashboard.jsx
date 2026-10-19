import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>JobTrackr</Text>
        <Text>Welcome, {user?.name || "User"}</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/applications")} style={btn}>
          <Text style={btnText}>Applications</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(tabs)/linkedin")} style={btn}>
          <Text style={btnText}>LinkedIn Overlay Setup</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} style={btnOutline}>
          <Text style={btnOutlineText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const btn = { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
const btnOutline = { borderColor: "#2563eb", borderWidth: 1, padding: 12, borderRadius: 8, alignItems: "center" };
const btnOutlineText = { color: "#2563eb", fontWeight: "600" };
