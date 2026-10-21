import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Switch, Modal } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  listUsers,
  disableUser,
  enableUser,
  deleteUser,
  setUserFeature,
  disableAllFeatures,
  enableAllFeatures,
  getAppVideo,
  saveAppVideo,
  getUserLogs,
} from "../../api/admin";
import { useAuth } from "../../context/AuthContext";
import { isAdminUser } from "../../constants";

const FEATURES = [
  { key: "sendEmail", label: "Send Email" },
  { key: "aiEmail", label: "AI Email" },
  { key: "autoFollowUp", label: "Auto Follow-up" },
  { key: "resumeUpload", label: "Resume Upload" },
  { key: "quickFill", label: "Quick Fill" },
];

const LOG_TYPES = [
  { key: "all", label: "All" },
  { key: "login", label: "Logins" },
  { key: "logout", label: "Logouts" },
  { key: "activity", label: "Activities" },
];

function VideoSetting() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppVideo()
      .then((d) => setUrl(d.url || ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const d = await saveAppVideo(url);
      setUrl(d.url);
      Alert.alert("Saved", d.url ? "Video saved" : "Video removed");
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to save video URL");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, gap: 8 }}>
      <Text style={{ fontWeight: "700" }}>Gmail setup video</Text>
      <Text style={{ color: "#6b7280", fontSize: 12 }}>
        YouTube video shown to users in the Connect Gmail popup. Leave empty to remove it.
      </Text>
      <TextInput
        placeholder="https://www.youtube.com/watch?v=..."
        value={url}
        onChangeText={setUrl}
        editable={!loading}
        autoCapitalize="none"
        style={input}
      />
      <TouchableOpacity onPress={save} disabled={busy || loading} style={[btn, { opacity: busy || loading ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={btnText}>Save video</Text>}
      </TouchableOpacity>
    </View>
  );
}

function UserLogsSection() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getUserLogs({ type, search, page, limit: 50 })
        .then((d) => {
          setLogs(d.logs || []);
          setTotal(d.total || 0);
          setPages(d.pages || 1);
        })
        .catch(() => Alert.alert("Error", "Failed to load user logs"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [type, search, page]);

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {LOG_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => {
              setType(t.key);
              setPage(1);
            }}
            style={chip(type === t.key)}
          >
            <Text style={chipText(type === t.key)}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TextInput
        placeholder="Search user or action..."
        value={search}
        onChangeText={(v) => {
          setSearch(v);
          setPage(1);
        }}
        style={input}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : logs.length === 0 ? (
        <Text style={{ color: "#6b7280", padding: 12 }}>No logs found.</Text>
      ) : (
        <>
          {logs.map((l) => (
            <View key={l._id} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, gap: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", textTransform: "capitalize", color: "#2563eb" }}>{l.type}</Text>
              <Text style={{ fontSize: 13 }}>{l.action || l.type}</Text>
              <Text style={{ fontSize: 11, color: "#6b7280" }}>
                {l.name || "Unnamed"} · {l.email}
                {l.location ? ` · ${[l.location.city, l.location.region, l.location.country].filter(Boolean).join(", ")}` : ""}
              </Text>
              <Text style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(l.createdAt).toLocaleString()}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>
              {total} entr{total === 1 ? "y" : "ies"} · page {page} of {pages}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1} style={[chip(false), { opacity: page <= 1 ? 0.4 : 1 }]}>
                <Text style={chipText(false)}>Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPage((p) => Math.min(p + 1, pages))} disabled={page >= pages} style={[chip(false), { opacity: page >= pages ? 0.4 : 1 }]}>
                <Text style={chipText(false)}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [disableTarget, setDisableTarget] = useState(null);
  const [disableReason, setDisableReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    listUsers()
      .then((d) => setUsers(d.users || []))
      .catch(() => Alert.alert("Error", "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchUser = (id, patch) =>
    setUsers((prev) => prev.map((u) => (u._id === id ? { ...u, ...patch } : u)));

  const handleDisable = async () => {
    const u = disableTarget;
    if (!u) return;
    setBusyId(u._id);
    try {
      await disableUser(u._id, disableReason);
      setDisableTarget(null);
      setDisableReason("");
      load();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to disable");
    } finally {
      setBusyId("");
    }
  };

  const handleEnable = async (u) => {
    setBusyId(u._id);
    try {
      await enableUser(u._id);
      load();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to enable");
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = (u) => {
    Alert.alert("Delete user", `Permanently delete ${u.email} and ALL their data? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(u._id);
          try {
            await deleteUser(u._id);
            load();
          } catch (err) {
            Alert.alert("Error", err.response?.data?.message || "Failed to delete");
          } finally {
            setBusyId("");
          }
        },
      },
    ]);
  };

  const handleFeature = async (u, feature, value) => {
    setBusyId(u._id);
    try {
      const d = await setUserFeature(u._id, feature, value);
      patchUser(u._id, { features: d.user.features, isDisabled: d.user.isDisabled });
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to update feature");
    } finally {
      setBusyId("");
    }
  };

  const handleAllFeatures = (u, enable) => {
    const run = async () => {
      setBusyId(u._id);
      try {
        const d = enable ? await enableAllFeatures(u._id) : await disableAllFeatures(u._id);
        patchUser(u._id, { features: d.user.features, isDisabled: d.user.isDisabled });
      } catch (err) {
        Alert.alert("Error", err.response?.data?.message || "Failed to update features");
      } finally {
        setBusyId("");
      }
    };
    if (!enable) {
      Alert.alert("Disable all", `Turn OFF every feature for ${u.email}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Disable", style: "destructive", onPress: run },
      ]);
    } else {
      run();
    }
  };

  if (!isAdminUser(user)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>Admin</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ color: "#2563eb" }}>Back</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: "#6b7280" }}>You do not have admin access.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Admin Access</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: "#2563eb" }}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: "#6b7280", fontSize: 12 }}>Manage users, their features and app settings.</Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => setTab("users")} style={chip(tab === "users")}>
            <Text style={chipText(tab === "users")}>Users</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab("logs")} style={chip(tab === "logs")}>
            <Text style={chipText(tab === "logs")}>User Logs</Text>
          </TouchableOpacity>
        </View>

        {tab === "logs" ? (
          <UserLogsSection />
        ) : (
          <>
            <VideoSetting />

            {loading ? (
              <ActivityIndicator style={{ marginTop: 20 }} />
            ) : users.length === 0 ? (
              <Text style={{ color: "#6b7280", padding: 12 }}>No users found.</Text>
            ) : (
              users.map((u) => {
                const offCount = FEATURES.filter((f) => u.features?.[f.key] === false).length;
                return (
                  <View key={u._id} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontWeight: "600" }}>{u.name || "Unnamed"}</Text>
                      {u.isAdmin ? <Text style={badge("#2563eb")}>Admin</Text> : null}
                      {u.isDisabled ? <Text style={badge("#dc2626")}>Disabled</Text> : null}
                      {!u.isDisabled && offCount > 0 ? <Text style={badge("#d97706")}>{offCount} off</Text> : null}
                      {u.gmailConnected ? <Text style={badge("#059669")}>Gmail</Text> : null}
                    </View>
                    <Text style={{ color: "#6b7280", fontSize: 12 }}>{u.email}</Text>
                    <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                      {u.applications} applications · {u.resumes} resumes · joined {new Date(u.createdAt).toLocaleDateString()}
                    </Text>

                    {!u.isAdmin ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        <TouchableOpacity onPress={() => setExpandedId(expandedId === u._id ? "" : u._id)} style={chip(expandedId === u._id)}>
                          <Text style={chipText(expandedId === u._id)}>Features</Text>
                        </TouchableOpacity>
                        {u.isDisabled ? (
                          <TouchableOpacity onPress={() => handleEnable(u)} disabled={busyId === u._id} style={chip(false)}>
                            <Text style={chipText(false)}>Enable</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => setDisableTarget(u)} disabled={busyId === u._id} style={chip(false)}>
                            <Text style={chipText(false)}>Disable</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => handleDelete(u)} disabled={busyId === u._id} style={chip(false)}>
                          <Text style={{ color: "#dc2626", fontSize: 12 }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {!u.isAdmin && expandedId === u._id ? (
                      <View style={{ borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8, gap: 6 }}>
                        {FEATURES.map((f) => (
                          <View key={f.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 14, color: "#374151" }}>{f.label}</Text>
                            <Switch
                              value={u.features?.[f.key] !== false}
                              disabled={busyId === u._id}
                              onValueChange={(v) => handleFeature(u, f.key, v)}
                            />
                          </View>
                        ))}
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                          <TouchableOpacity onPress={() => handleAllFeatures(u, false)} disabled={busyId === u._id} style={chip(false)}>
                            <Text style={chipText(false)}>Disable all</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleAllFeatures(u, true)} disabled={busyId === u._id} style={chip(false)}>
                            <Text style={chipText(false)}>Enable all</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={{ fontSize: 11, color: "#9ca3af" }}>
                          Disabling a feature blocks it instantly with a &quot;contact support&quot; popup for the user.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!disableTarget} transparent animationType="fade" onRequestClose={() => setDisableTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 10 }}>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>Disable account</Text>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>Reason for disabling {disableTarget?.email}?</Text>
            <TextInput
              value={disableReason}
              onChangeText={setDisableReason}
              placeholder="Optional reason"
              style={input}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={handleDisable} style={[btn, { flex: 1 }]}>
                <Text style={btnText}>Disable</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDisableTarget(null); setDisableReason(""); }} style={{ flex: 1, borderWidth: 1, borderColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: "#2563eb", fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
const chip = (active) => ({ borderWidth: 1, borderColor: active ? "#2563eb" : "#e5e7eb", backgroundColor: active ? "#eff6ff" : "#fff", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center" });
const chipText = (active) => ({ color: active ? "#2563eb" : "#374151", fontSize: 12 });
const badge = (color) => ({ color, fontSize: 10, fontWeight: "700", borderWidth: 1, borderColor: color, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 });
