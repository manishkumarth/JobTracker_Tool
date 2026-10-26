import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
} from "../../api/templates";
import { useTheme } from "../../context/ThemeContext";

const TYPES = [
  "Job Application",
  "Follow-up",
  "Thank You",
  "Interview",
  "Referral",
  "Cold Outreach",
  "Recruiter Response",
  "Other",
];

const emptyForm = { name: "", subject: "", body: "", emailType: "Job Application" };

export default function Templates() {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // null | form object (with optional _id)
  const [busy, setBusy] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await listTemplates();
      const list = Array.isArray(res) ? res : res.templates || [];
      setItems(list);
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

  const openCreate = () => setEditing({ ...emptyForm });
  const openEdit = (t) =>
    setEditing({
      _id: t._id,
      name: t.name || "",
      subject: t.subject || "",
      body: t.body || "",
      emailType: t.emailType || t.type || "Job Application",
    });

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.subject?.trim()) {
      Alert.alert("Required", "Name and subject are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: editing.name.trim(),
        subject: editing.subject.trim(),
        body: editing.body || "",
        emailType: editing.emailType,
      };
      if (editing._id) await updateTemplate(editing._id, payload);
      else await createTemplate(payload);
      setEditing(null);
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (id, name) => {
    Alert.alert("Delete template", `Delete "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTemplate(id);
            await load();
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  const onDuplicate = async (id) => {
    try {
      await duplicateTemplate(id);
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const vars = (text) => {
    if (!text) return [];
    const m = text.match(/\{\{[^}]+\}\}/g);
    return [...new Set(m || [])];
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
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Templates</Text>
        <TouchableOpacity onPress={openCreate}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const used = vars(`${item.subject || ""} ${item.body || ""}`);
          return (
            <TouchableOpacity
              onPress={() => openEdit(item)}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                backgroundColor: colors.card,
                gap: 4,
              }}
            >
              <Text style={{ fontWeight: "700", color: colors.text }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                {item.subject}
              </Text>
              {item.emailType || item.type ? (
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>
                  {item.emailType || item.type}
                </Text>
              ) : null}
              {used.length ? (
                <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                  Vars: {used.join(" ")}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
                <TouchableOpacity onPress={() => openEdit(item)}>
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDuplicate(item._id)}>
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 12 }}>Duplicate</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item._id, item.name)}>
                  <Text style={{ color: colors.danger, fontWeight: "600", fontSize: 12 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 24 }}>
            No templates yet. Tap + Add to create one.
          </Text>
        }
      />

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setEditing(null)}>
              <Text style={{ color: colors.primary }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontWeight: "700", color: colors.text }}>
              {editing?._id ? "Edit template" : "New template"}
            </Text>
            <TouchableOpacity onPress={save} disabled={busy}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>{busy ? "..." : "Save"}</Text>
            </TouchableOpacity>
          </View>
          {editing ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Name</Text>
              <TextInput
                value={editing.name}
                onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))}
                placeholder="Template name"
                placeholderTextColor={colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  color: colors.text,
                  backgroundColor: colors.card,
                }}
              />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setEditing((e) => ({ ...e, emailType: t }))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: editing.emailType === t ? colors.primary : colors.border,
                      backgroundColor: editing.emailType === t ? colors.primary + "18" : colors.card,
                    }}
                  >
                    <Text
                      style={{
                        color: editing.emailType === t ? colors.primary : colors.text,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Subject</Text>
              <TextInput
                value={editing.subject}
                onChangeText={(v) => setEditing((e) => ({ ...e, subject: v }))}
                placeholder="Subject with {{variables}}"
                placeholderTextColor={colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  color: colors.text,
                  backgroundColor: colors.card,
                }}
              />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Body</Text>
              <TextInput
                value={editing.body}
                onChangeText={(v) => setEditing((e) => ({ ...e, body: v }))}
                placeholder="Body — use {{jobTitle}}, {{companyName}}, {{candidateName}}, etc."
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 12,
                  minHeight: 180,
                  color: colors.text,
                  backgroundColor: colors.card,
                  textAlignVertical: "top",
                }}
              />
              {vars(`${editing.subject} ${editing.body}`).length > 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Detected: {vars(`${editing.subject} ${editing.body}`).join(", ")}
                </Text>
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
