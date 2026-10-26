import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  ScrollView,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import { listApplications, deleteApplication } from "../../../api/applications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../../context/ThemeContext";
import { router, useFocusEffect } from "expo-router";
import { STATUS_COLORS, APPLICATION_STATUSES } from "../../../constants";

export default function Applications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const { colors } = useTheme();

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await listApplications({ limit: 50 });
      setData(res);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const onDelete = (id) => {
    Alert.alert("Delete", "Delete this application?", [
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

  if (loading && !refreshing) {
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
        <TouchableOpacity onPress={() => load()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.primary }}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const allItems = data?.applications || (Array.isArray(data) ? data : []) || [];
  const items = useMemo(() => {
    let list = allItems;
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          (a.jobTitle || "").toLowerCase().includes(q) ||
          (a.companyName || a.company?.name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allItems, statusFilter, search]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Applications</Text>
        <TouchableOpacity onPress={() => router.push("/applications/new")}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Add</Text>
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 4 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search title or company"
          placeholderTextColor={colors.textMuted}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            padding: 10,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => setStatusFilter("")}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: !statusFilter ? colors.primary : colors.border,
              backgroundColor: !statusFilter ? colors.primary + "18" : colors.card,
            }}
          >
            <Text style={{ color: !statusFilter ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>
              All
            </Text>
          </TouchableOpacity>
          {APPLICATION_STATUSES.slice(0, 12).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(s)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: statusFilter === s ? colors.primary : colors.border,
                backgroundColor: statusFilter === s ? colors.primary + "18" : colors.card,
              }}
            >
              <Text
                style={{
                  color: statusFilter === s ? colors.primary : colors.text,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {s.replaceAll("_", " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status] || colors.textMuted;
          return (
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/applications/[id]", params: { id: item._id } })
              }
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 14,
                gap: 6,
                backgroundColor: colors.card,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ fontWeight: "700", color: colors.text, flex: 1 }}>
                  {item.jobTitle || "Untitled"}
                </Text>
                <View
                  style={{
                    backgroundColor: statusColor + "22",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: statusColor, fontSize: 11, fontWeight: "600" }}>
                    {(item.status || "").replaceAll("_", " ")}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.textMuted }}>{item.companyName || item.company?.name || "—"}</Text>
              {item.location ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.location}</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={() =>
                    router.push({ pathname: "/applications/[id]", params: { id: item._id } })
                  }
                >
                  <Text style={{ color: colors.primary, fontSize: 13 }}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item._id)}>
                  <Text style={{ color: colors.danger, fontSize: 13 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, padding: 16, textAlign: "center" }}>
            No applications yet. Tap + Add to create one or use Quick Fill.
          </Text>
        }
      />
    </SafeAreaView>
  );
}
