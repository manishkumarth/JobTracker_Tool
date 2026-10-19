import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

// Generic list screen: pass loadFn (returns array), titleField, subtitleField, and optional onDeleteFn / onCreateFn
export default function ListScreen({ title, loadFn, titleField = "name", subtitleField, onDeleteFn, createFields, createFn, renderItem: renderItemProp }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await loadFn();
      // responses vary: some return array directly, some { companies: [] }, etc.
      const arr = Array.isArray(res)
        ? res
        : res?.companies || res?.contacts || res?.emails || res?.templates || res?.followups || res?.interviews || [];
      setItems(arr);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [loadFn]);

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
        <Text style={{ color: "#dc2626" }}>{err}</Text>
        <TouchableOpacity onPress={load} style={{ marginTop: 12 }}>
          <Text style={{ color: "#2563eb" }}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>{title}</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {createFn ? (
            <TouchableOpacity onPress={() => setShowCreate(true)}>
              <Text style={{ color: "#2563eb", fontWeight: "600" }}>Add</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: "#2563eb" }}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item, i) => item._id || i.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 20 }}
        renderItem={
          renderItemProp ||
          (({ item }) => (
            <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 4 }}>
              <Text style={{ fontWeight: "600" }}>{item[titleField] || item.name || item.subject || item.title || "—"}</Text>
              {subtitleField && item[subtitleField] ? <Text style={{ color: "#6b7280" }}>{item[subtitleField]}</Text> : null}
              {item.status ? <Text style={{ color: "#374151", fontSize: 12 }}>{item.status}</Text> : null}
              {onDeleteFn ? (
                <TouchableOpacity onPress={() => onDelete(item._id)} style={{ marginTop: 4 }}>
                  <Text style={{ color: "#dc2626" }}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        }
        ListEmptyComponent={<Text style={{ color: "#6b7280", padding: 16 }}>No items yet</Text>}
      />

      {createFn && createFields ? (
        <Modal visible={showCreate} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 }}>
            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 10 }}>
              <Text style={{ fontWeight: "700", fontSize: 16 }}>New {title.replace(/s$/, "")}</Text>
              {createFields.map((f) => (
                <TextInput
                  key={f.key}
                  placeholder={f.label}
                  value={createForm[f.key] || ""}
                  onChangeText={(v) => setCreateForm((c) => ({ ...c, [f.key]: v }))}
                  multiline={f.multiline}
                  style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, minHeight: f.multiline ? 80 : undefined, textAlignVertical: f.multiline ? "top" : undefined }}
                />
              ))}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={onCreate} style={{ flex: 1, backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowCreate(false)} style={{ flex: 1, borderWidth: 1, borderColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ color: "#2563eb", fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}
