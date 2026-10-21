import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTheme } from "../context/ThemeContext";

export default function ListScreen({
  title,
  loadFn,
  titleField = "name",
  subtitleField,
  onDeleteFn,
  createFields,
  createFn,
  renderItem: renderItemProp,
}) {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({});

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErr("");
      try {
        const res = await loadFn();
        const arr = Array.isArray(res)
          ? res
          : res?.companies ||
            res?.contacts ||
            res?.emails ||
            res?.templates ||
            res?.followups ||
            res?.interviews ||
            res?.applications ||
            [];
        setItems(arr);
      } catch (e) {
        setErr(e?.response?.data?.message || e.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadFn]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = (id) => {
    if (!onDeleteFn) return;
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await onDeleteFn(id);
            await load();
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  const onCreate = async () => {
    if (!createFn) return;
    try {
      await createFn(createForm);
      setShowCreate(false);
      setCreateForm({});
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    backgroundColor: colors.bg,
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

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
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{title}</Text>
        {createFn ? (
          <TouchableOpacity onPress={() => setShowCreate(true)}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>
      {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item._id || String(Math.random())}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 20 }}
        renderItem={
          renderItemProp ||
          (({ item }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 12,
                gap: 4,
                backgroundColor: colors.card,
              }}
            >
              <Text style={{ fontWeight: "600", color: colors.text }}>
                {item[titleField] || item.name || item.subject || item.title || "—"}
              </Text>
              {subtitleField && item[subtitleField] ? (
                <Text style={{ color: colors.textMuted }}>{item[subtitleField]}</Text>
              ) : null}
              {item.status ? (
                <Text style={{ color: colors.text, fontSize: 12 }}>{item.status}</Text>
              ) : null}
              {onDeleteFn ? (
                <TouchableOpacity onPress={() => onDelete(item._id)} style={{ marginTop: 4 }}>
                  <Text style={{ color: colors.danger }}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        }
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, padding: 16, textAlign: "center" }}>No items yet</Text>
        }
      />

      {createFn && createFields ? (
        <Modal visible={showCreate} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 }}>
            <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 10 }}>
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>
                New {title.replace(/s$/, "")}
              </Text>
              {createFields.map((f) => (
                <TextInput
                  key={f.key}
                  placeholder={f.label}
                  value={createForm[f.key] || ""}
                  onChangeText={(v) => setCreateForm((c) => ({ ...c, [f.key]: v }))}
                  multiline={f.multiline}
                  style={[
                    inputStyle,
                    {
                      minHeight: f.multiline ? 80 : undefined,
                      textAlignVertical: f.multiline ? "top" : undefined,
                    },
                  ]}
                  placeholderTextColor={colors.textMuted}
                />
              ))}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={onCreate}
                  style={{
                    flex: 1,
                    backgroundColor: colors.primary,
                    padding: 12,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowCreate(false)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: colors.primary,
                    padding: 12,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}
