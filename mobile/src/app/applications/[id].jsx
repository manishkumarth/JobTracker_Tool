import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getApplication,
  addNote,
  changeStatus,
  deleteApplication,
  computeMatchScore,
  APPLICATION_STATUSES,
} from "../../api/applications";
import { generateFollowUpEmail, refineEmail } from "../../api/ai";
import { sendMail, autoSendApplicationEmail } from "../../api/emails";
import { createFollowUp } from "../../api/followups";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { STATUS_COLORS } from "../../constants";

const FOLLOW_UP_TYPES = [
  "Email Follow-up",
  "Call Follow-up",
  "LinkedIn Follow-up",
  "Recruiter Follow-up",
  "Interview Follow-up",
  "General",
];

export default function ApplicationDetail() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [statusPicker, setStatusPicker] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailStep, setEmailStep] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStep, setAutoStep] = useState("");

  /* Follow-up action menu */
  const [followUpMenu, setFollowUpMenu] = useState(false);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpDisabled, setFollowUpDisabled] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleType, setScheduleType] = useState("Interview Follow-up");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await getApplication(id);
      setApp(res.application || res);
      await loadFollowUpDisabled();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const onAddNote = async () => {
    if (!note.trim()) return;
    try {
      await addNote(id, note.trim());
      setNote("");
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onChangeStatus = async (s) => {
    setStatusPicker(false);
    try {
      await changeStatus(id, s);
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const onDelete = () => {
    Alert.alert("Delete", "Delete this application?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteApplication(id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };

  const loadFollowUpDisabled = async () => {
    try {
      const v = await AsyncStorage.getItem(`jt_fu_disabled_${id}`);
      setFollowUpDisabled(v === "true");
    } catch {}
  };

  const toggleFollowUpDisabled = async () => {
    const next = !followUpDisabled;
    setFollowUpDisabled(next);
    try {
      await AsyncStorage.setItem(`jt_fu_disabled_${id}`, next ? "true" : "false");
      Alert.alert(
        next ? "Follow-ups disabled" : "Follow-ups enabled",
        next
          ? "This job won't be included in auto follow-ups."
          : "This job will be included in auto follow-ups again."
      );
    } catch {}
  };

  const autoDraftAndSend = async () => {
    if (!user?.gmailConnected) {
      Alert.alert("Gmail required", "Connect Gmail in Profile first.");
      return;
    }
    if (!app.hrEmail && !app.contact?.email) {
      Alert.alert("Missing email", "Add an HR email or link a contact on this application first.");
      return;
    }
    setAutoBusy(true);
    setAutoStep("Matching resume & drafting email...");
    try {
      const result = await autoSendApplicationEmail(id);
      const sent = (result.results || []).filter((r) => r.status === "sent").length;
      if (sent > 0) {
        Alert.alert(
          "Email sent",
          result.resume?.originalName
            ? `AI email sent with ${result.resume.originalName}.`
            : "AI email sent from your Gmail."
        );
      } else {
        Alert.alert("Not sent", "The email could not be sent. Check Email History for details.");
      }
      await load();
    } catch (e) {
      Alert.alert(
        "Email not sent",
        e?.response?.data?.message ||
          "No matching resume was found. Add role notes to your resumes in Profile and try again."
      );
    } finally {
      setAutoBusy(false);
      setAutoStep("");
    }
  };

  const openFollowUp = async () => {
    if (followUpDisabled) {
      Alert.alert("Follow-ups disabled", "Enable follow-ups for this job first from the Follow-up menu.");
      return;
    }
    if (!user?.gmailConnected) {
      Alert.alert("Gmail required", "Connect Gmail in Profile first.");
      return;
    }
    setEmailBusy(true);
    setEmailStep("Generating follow-up...");
    setEmailModal(true);
    try {
      const data = await generateFollowUpEmail(id);
      setEmailSubject(data.subject || "");
      setEmailBody(data.body || "");
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
      setEmailModal(false);
    } finally {
      setEmailBusy(false);
      setEmailStep("");
    }
  };

  const openScheduleMenu = () => setFollowUpMenu(true);

  const scheduleFollowUp = async (typeOverride) => {
    setFollowUpMenu(false);
    setScheduleType(typeOverride || "Interview Follow-up");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow.toISOString().slice(0, 16));
    setScheduleNote("");
    setScheduleModal(true);
  };

  const saveScheduledFollowUp = async () => {
    if (!scheduleDate) {
      Alert.alert("Required", "Pick a date and time");
      return;
    }
    setFollowUpBusy(true);
    try {
      await createFollowUp({
        application: id,
        type: scheduleType,
        date: scheduleDate,
        note: scheduleNote,
      });
      setScheduleModal(false);
      await load();
      Alert.alert("Scheduled", "Follow-up scheduled");
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setFollowUpBusy(false);
    }
  };

  const onMatchScore = async () => {
    try {
      const res = await computeMatchScore(id);
      const score = res.score ?? res.matchScore ?? res.application?.matchScore;
      Alert.alert("Match score", score != null ? String(score) : JSON.stringify(res));
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    }
  };

  const refine = async (instruction) => {
    setEmailBusy(true);
    try {
      const data = await refineEmail({
        subject: emailSubject,
        body: emailBody,
        instruction,
      });
      setEmailSubject(data.subject || emailSubject);
      setEmailBody(data.body || emailBody);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setEmailBusy(false);
    }
  };

  const sendEmail = async () => {
    const to = app.hrEmail || app.contact?.email;
    if (!to) {
      Alert.alert("Missing email", "No recruiter email on this application.");
      return;
    }
    setEmailBusy(true);
    setEmailStep("Sending...");
    try {
      await sendMail({
        recipientEmail: to,
        recipientName: app.hrName || app.contact?.name || "",
        subject: emailSubject,
        message: emailBody,
        applicationId: id,
        emailType: "Follow-up",
        isAiGenerated: true,
      });
      Alert.alert("Sent", "Email sent from your Gmail");
      setEmailModal(false);
      await load();
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message);
    } finally {
      setEmailBusy(false);
      setEmailStep("");
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (err || !app) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 16, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.danger }}>{err || "Not found"}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLORS[app.status] || colors.textMuted;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{app.jobTitle}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>
          {app.companyName || app.company?.name || "—"}
        </Text>

        <TouchableOpacity
          onPress={() => setStatusPicker(true)}
          style={{
            alignSelf: "flex-start",
            backgroundColor: statusColor + "22",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: statusColor, fontWeight: "600" }}>
            {(app.status || "").replaceAll("_", " ")} ▾
          </Text>
        </TouchableOpacity>

        {app.location ? <Text style={{ color: colors.text }}>📍 {app.location}</Text> : null}
        {app.salary ? <Text style={{ color: colors.text }}>💰 {app.salary}</Text> : null}
        {app.workMode ? <Text style={{ color: colors.text }}>🏢 {app.workMode}</Text> : null}
        {app.hrName || app.hrEmail ? (
          <Text style={{ color: colors.text }}>
            👤 {app.hrName || ""} {app.hrEmail ? `<${app.hrEmail}>` : ""}
          </Text>
        ) : null}

        {app.jobDescription ? (
          <View style={{ gap: 4 }}>
            <Text style={{ fontWeight: "600", color: colors.text }}>Job Description</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{app.jobDescription}</Text>
          </View>
        ) : null}

        {Array.isArray(app.requiredSkills) && app.requiredSkills.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {app.requiredSkills.map((s) => (
              <View
                key={s}
                style={{
                  backgroundColor: colors.border,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 12, color: colors.text }}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
          <TouchableOpacity
            onPress={autoDraftAndSend}
            disabled={autoBusy}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, opacity: autoBusy ? 0.6 : 1 }}
          >
            {autoBusy ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={{ color: "#fff", fontWeight: "600" }}>Working...</Text>
              </View>
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600" }}>Auto Draft &amp; Send Email</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openScheduleMenu}
            disabled={followUpBusy}
            style={{
              backgroundColor: followUpDisabled ? "#9ca3af" : colors.warning,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 8,
              opacity: followUpBusy ? 0.6 : 1,
            }}
          >
            {followUpBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600" }}>Follow-up ▾</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMatchScore}
            style={{ backgroundColor: "#7c3aed", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Match score</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            style={{ borderWidth: 1, borderColor: colors.danger, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: colors.danger, fontWeight: "600" }}>Delete</Text>
          </TouchableOpacity>
        </View>
        {autoBusy && autoStep ? (
          <Text style={{ color: colors.primary, fontSize: 12 }}>{autoStep}</Text>
        ) : null}

        {/* Notes */}
        <Text style={{ fontWeight: "600", color: colors.text, marginTop: 8 }}>Notes</Text>
        <TextInput
          placeholder="Add a note..."
          value={note}
          onChangeText={setNote}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          onPress={onAddNote}
          style={{ backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Add Note</Text>
        </TouchableOpacity>
        {(app.notes || []).map((n, i) => (
          <View
            key={i}
            style={{
              borderLeftWidth: 3,
              borderLeftColor: colors.primary,
              paddingLeft: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13 }}>{n.text || n}</Text>
            {n.createdAt ? (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {new Date(n.createdAt).toLocaleString()}
              </Text>
            ) : null}
          </View>
        ))}

        {/* Timeline */}
        {Array.isArray(app.timeline) && app.timeline.length > 0 ? (
          <>
            <Text style={{ fontWeight: "600", color: colors.text, marginTop: 8 }}>Timeline</Text>
            {app.timeline.map((t, i) => (
              <Text key={i} style={{ color: colors.textMuted, fontSize: 12 }}>
                {t.status || t.action} — {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
              </Text>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Status picker modal */}
      <Modal visible={statusPicker} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "60%" }}>
            <Text style={{ fontWeight: "700", padding: 16, color: colors.text }}>Change Status</Text>
            <FlatList
              data={APPLICATION_STATUSES}
              keyExtractor={(s) => s}
              renderItem={({ item: s }) => (
                <TouchableOpacity
                  onPress={() => onChangeStatus(s)}
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: s === app.status ? colors.primary + "22" : "transparent",
                  }}
                >
                  <Text style={{ color: colors.text }}>{s.replaceAll("_", " ")}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setStatusPicker(false)} style={{ padding: 16, alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Email modal */}
      <Modal visible={emailModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Email</Text>
              <TouchableOpacity onPress={() => setEmailModal(false)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            {emailBusy && emailStep ? (
              <Text style={{ color: colors.primary }}>{emailStep}</Text>
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Subject</Text>
            <TextInput
              value={emailSubject}
              onChangeText={setEmailSubject}
              style={inputStyle}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Body</Text>
            <TextInput
              value={emailBody}
              onChangeText={setEmailBody}
              multiline
              style={[inputStyle, { height: 280, textAlignVertical: "top" }]}
              placeholderTextColor={colors.textMuted}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity
                onPress={() => refine("Make shorter")}
                disabled={emailBusy}
                style={{ borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ color: colors.text, fontSize: 12 }}>Shorter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => refine("More professional")}
                disabled={emailBusy}
                style={{ borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ color: colors.text, fontSize: 12 }}>More professional</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => refine("More personalized")}
                disabled={emailBusy}
                style={{ borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ color: colors.text, fontSize: 12 }}>More personalized</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={sendEmail}
              disabled={emailBusy || !emailBody}
              style={{ backgroundColor: colors.success, padding: 14, borderRadius: 8, alignItems: "center" }}
            >
              {emailBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "600" }}>Send via Gmail</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Follow-up action menu */}
      <Modal visible={followUpMenu} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, padding: 16, gap: 8, maxHeight: "75%" }}>
            <Text style={{ fontWeight: "700", color: colors.text, marginBottom: 6 }}>
              Follow-up for {app?.jobTitle || "this job"}
            </Text>
            {followUpDisabled ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
                Follow-ups are currently disabled for this job.
              </Text>
            ) : null}
            <FlatList
              data={[
                { label: "Follow-up Email", onPress: openFollowUp, disabled: followUpDisabled || !user?.gmailConnected },
                { label: "Follow-up Interview", onPress: () => scheduleFollowUp("Interview Follow-up"), disabled: followUpDisabled },
                { label: "Add more (custom)", onPress: () => scheduleFollowUp("General"), disabled: followUpDisabled },
                {
                  label: followUpDisabled ? "Enable follow-ups for this job" : "Disable follow-ups for this job",
                  onPress: toggleFollowUpDisabled,
                },
              ]}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={item.disabled ? undefined : item.onPress}
                  disabled={item.disabled}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    opacity: item.disabled ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: item.disabled ? colors.textMuted : colors.text, fontSize: 14 }}>
                    {item.label}
                  </Text>
                  {!item.disabled ? <Text style={{ color: colors.primary, fontSize: 12 }}>&gt;</Text> : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              onPress={() => setFollowUpMenu(false)}
              style={{ padding: 14, alignItems: "center", marginTop: 4 }}
            >
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule / custom follow-up modal */}
      <Modal visible={scheduleModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                Schedule follow-up
              </Text>
              <TouchableOpacity onPress={() => setScheduleModal(false)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{scheduleType}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Date & time</Text>
            <TextInput
              value={scheduleDate}
              onChangeText={setScheduleDate}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Note (optional)</Text>
            <TextInput
              value={scheduleNote}
              onChangeText={setScheduleNote}
              placeholder="e.g. Check status after interview"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
            <TouchableOpacity
              onPress={saveScheduledFollowUp}
              disabled={followUpBusy || !scheduleDate}
              style={{
                backgroundColor: colors.primary,
                padding: 14,
                borderRadius: 8,
                alignItems: "center",
                opacity: followUpBusy || !scheduleDate ? 0.6 : 1,
              }}
            >
              {followUpBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "600" }}>Schedule</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
