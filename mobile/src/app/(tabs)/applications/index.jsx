import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useEffect, useState } from "react";
import { listApplications, deleteApplication } from "../../../api/applications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../../context/ThemeContext";
import { router } from "expo-router";

export default function Applications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const { colors } = useTheme();

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await listApplications({ limit: 20 });
      setData(res);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteApplication(id);
            await load();
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
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

  if (err) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Text style={{ color: colors.danger }}>{err}</Text>
      </SafeAreaView>
    );
  }

  const items = data?.applications || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Applications</Text>
        <TouchableOpacity onPress={() => router.push("/applications/new")}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Add</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 4 }}>
            <Text style={{ fontWeight: "600" }}>{item.jobTitle || "Untitled"}</Text>
            <Text style={{ color: colors.textMuted }}>{item.companyName || "-"}</Text>
            <Text style={{ color: colors.text, fontSize: 12 }}>{item.status}</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              <TouchableOpacity onPress={() => router.push({ pathname: "/applications/[id]", params: { id: item._id } })}>
                <Text style={{ color: colors.primary }}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(item._id)}>
                <Text style={{ color: colors.danger }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: 16 }}>No applications yet</Text>}
      />
    </SafeAreaView>
  );
}
