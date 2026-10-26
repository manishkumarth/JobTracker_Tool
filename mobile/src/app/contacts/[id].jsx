import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getContact } from "../../api/contacts";
import { listWhatsAppMessages, logWhatsAppMessage, rewriteWhatsAppMessage } from "../../api/whatsapp";
import { useTheme } from "../../context/ThemeContext";
import { STATUS_COLORS } from "../../constants";

export default function ContactDetail() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [waMessages, setWaMessages] = useState([]);
  const [composer, setComposer] = useState(false);
  const [waText, setWaText] = useState("");
  const [waBusy, setWaBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await getContact(id);
      setData(res);
      const contactId = res?.contact?._id || res?._id;
      if (contactId) {
        try {
          const w = await listWhatsAppMessages({ contact: contactId, limit: 50 });
          setWaMessages(w.messages || w || []);
        } catch {
          setWaMessages([]);
        }
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (err || !data) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.danger, marginTop: 12 }}>{err || "Not found"}</Text>
      </SafeAreaView>
    );
  }

  const contact = data.contact || data;
  const applications = data.applications || [];
  const emails = data.emails || [];
  const calls = data.calls || [];

  const cleanPhone = () => {
    const raw = contact.phone || "";
    const cleaned = raw.replace(/[^0-9+]/g, "");
    if (cleaned.startsWith("+")) return cleaned.slice(1);
    return cleaned;
  };

  const openWhatsApp = async () => {
    const phone = cleanPhone();
    if (!phone) {
      Alert.alert("No phone", "This contact has no phone number.");
      return;
    }
    const url = `https://wa.me/${phone}`;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Alert.alert("Error", "Cannot open WhatsApp");
  };

  const sendWaLog = async () => {
    if (!waText.trim()) return;
    setWaBusy(true);
    try {
      await logWhatsAppMessage({
        contact: contact._id,
        message: waText.trim(),
        direction: "outbound",
      });
      setWaText("");
      setComposer(false);
      await load();
      Alert.alert("Logged", "WhatsApp message logged");
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setWaBusy(false);
    }
  };

  const rewriteWa = async () => {
    if (!waText.trim()) return;
    setWaBusy(true);
    try {
      const data = await rewriteWhatsAppMessage({ message: waText.trim() });
      setWaText(data.message || data.rewritten || waText);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setWaBusy(false);
    }
  };

  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.card,
    gap: 6,
  };
  const btn = {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>
          {contact.name || contact.email}
        </Text>
        <Text style={{ color: colors.textMuted }}>
          {[contact.designation, contact.contactType].filter(Boolean).join(" · ") || "—"}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {contact.email ? (
            <TouchableOpacity
              style={btn}
              onPress={() => Linking.openURL(`mailto:${contact.email}`)}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Email</Text>
            </TouchableOpacity>
          ) : null}
          {contact.phone ? (
            <TouchableOpacity style={btn} onPress={() => Linking.openURL(`tel:${contact.phone}`)}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Call</Text>
            </TouchableOpacity>
          ) : null}
          {contact.phone ? (
            <TouchableOpacity style={{ ...btn, backgroundColor: "#25D366" }} onPress={openWhatsApp}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>WhatsApp</Text>
            </TouchableOpacity>
          ) : null}
          {contact.phone ? (
            <TouchableOpacity
              style={{ ...btn, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
              onPress={() => setComposer(true)}
            >
              <Text style={{ color: colors.text, fontWeight: "600" }}>Log WA</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={card}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Details</Text>
          {contact.email ? <Text style={{ color: colors.text }}>✉️ {contact.email}</Text> : null}
          {contact.phone ? <Text style={{ color: colors.text }}>📞 {contact.phone}</Text> : null}
          {contact.linkedinUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(contact.linkedinUrl)}>
              <Text style={{ color: colors.primary }}>LinkedIn ↗</Text>
            </TouchableOpacity>
          ) : null}
          {contact.notes ? <Text style={{ color: colors.textMuted }}>{contact.notes}</Text> : null}
        </View>

        <View style={card}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Applications ({applications.length})</Text>
          {applications.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>None yet.</Text>
          ) : (
            applications.map((a) => {
              const sc = STATUS_COLORS[a.status] || colors.textMuted;
              return (
                <TouchableOpacity
                  key={a._id}
                  onPress={() => router.push(`/applications/${a._id}`)}
                  style={{
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: colors.text, flex: 1 }}>{a.jobTitle}</Text>
                  <Text style={{ color: sc, fontSize: 11 }}>{(a.status || "").replaceAll("_", " ")}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={card}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Emails ({emails.length})</Text>
          {emails.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>None yet.</Text>
          ) : (
            emails.slice(0, 10).map((e) => (
              <View key={e._id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.text }} numberOfLines={1}>
                  {e.subject || "(no subject)"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{e.status}</Text>
              </View>
            ))
          )}
        </View>

        {waMessages.length > 0 ? (
          <View style={card}>
            <Text style={{ fontWeight: "700", color: colors.text }}>WhatsApp log</Text>
            {waMessages.slice(0, 15).map((m) => (
              <View key={m._id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>{m.message || m.body}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {m.direction || ""} {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {calls.length > 0 ? (
          <View style={card}>
            <Text style={{ fontWeight: "700", color: colors.text }}>Calls</Text>
            {calls.map((c) => (
              <View key={c._id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.text }}>{c.notes || c.outcome || "Call"}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={composer} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10 }}>
            <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>WhatsApp message</Text>
            <TextInput
              value={waText}
              onChangeText={setWaText}
              multiline
              placeholder="Type message..."
              placeholderTextColor={colors.textMuted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 12,
                minHeight: 100,
                color: colors.text,
                textAlignVertical: "top",
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={rewriteWa}
                disabled={waBusy}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center" }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600" }}>AI rewrite</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendWaLog}
                disabled={waBusy}
                style={{ flex: 1, backgroundColor: "#25D366", padding: 12, borderRadius: 8, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>{waBusy ? "..." : "Log & open"}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={async () => {
                await sendWaLog();
                openWhatsApp();
              }}
              style={{ backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Log + Open WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setComposer(false)} style={{ alignItems: "center", padding: 8 }}>
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
