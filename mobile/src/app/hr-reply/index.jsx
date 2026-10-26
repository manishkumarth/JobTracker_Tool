import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Switch } from "react-native";
import { useEffect, useState, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { listTemplates } from "../../api/templates";
import { listResumes } from "../../api/resumes";
import { generateDetailReply } from "../../api/ai";
import { sendMail } from "../../api/emails";
import { useAuth } from "../../context/AuthContext";

const TYPES = ["Job Application", "Follow-up", "Thank You", "Interview", "Referral", "Other"];

export default function HRReply() {
  const { user } = useAuth();
  const [requestText, setRequestText] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [emailType, setEmailType] = useState("Recruiter Response");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoDraft, setAutoDraft] = useState(false);
  const [autoSend, setAutoSend] = useState(false);

  const requireGmail = useCallback(() => {
    if (!user?.gmailConnected) {
      Alert.alert(
        "Gmail not connected",
        "Connect your Gmail in Profile settings before sending emails.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Profile", onPress: () => router.push("/(tabs)/profile") },
        ]
      );
      return false;
    }
    return true;
  }, [user?.gmailConnected]);

  useEffect(() => {
    listTemplates().then((d) => setTemplates(Array.isArray(d) ? d : d?.templates || [])).catch(() => {});
    listResumes().then((d) => {
      const list = Array.isArray(d) ? d : d?.resumes || [];
      setResumes(list);
      const def = list.find((r) => r.isDefault);
      if (def) setResumeId(def._id);
    }).catch(() => {});

    // Prefill from Gmail overlay (single popup adapts LinkedIn → Gmail)
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("jt_hr_reply_draft");
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft.requestText) setRequestText(draft.requestText);
        if (draft.recipientEmail) setRecipientEmail(draft.recipientEmail);
        if (draft.recipientName) setRecipientName(draft.recipientName);
        if (draft.subject) setSubject(draft.subject);
        await AsyncStorage.removeItem("jt_hr_reply_draft");
        // Auto-generate AI reply when coming from Gmail overlay (manual review path)
        if (draft.fromGmail && draft.requestText) {
          setTimeout(() => {
            try {
              // handleGenerate is defined later; trigger via storage flag
              AsyncStorage.setItem("jt_hr_reply_autogen", "1");
            } catch {}
          }, 100);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Auto-extract a recruiter email from the pasted request
  useEffect(() => {
    const compact = requestText.replace(/\s+/g, " ");
    const m = compact.match(/([\w.-]+)\s*@\s*([\w-]+)\s*\.\s*([a-zA-Z]{2,})/i);
    if (m) {
      const email = `${m[1]}@${m[2]}.${m[3]}`.replace(/\s+/g, "");
      setRecipientEmail((prev) => (prev ? prev : email));
    }
    const fromMatch = compact.match(/From\s+([A-Za-z][A-Za-z ]{1,40}?)\s+[\w.-]+@/i);
    if (fromMatch) {
      setRecipientName((prev) => (prev ? prev : fromMatch[1].trim()));
    }
  }, [requestText]);

  // If opened from Gmail overlay, auto-run AI draft once fields are ready
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const flag = await AsyncStorage.getItem("jt_hr_reply_autogen");
      if (!flag || !requestText.trim()) return;
      await AsyncStorage.removeItem("jt_hr_reply_autogen");
      if (cancelled) return;
      // slight delay so state from setRecipientEmail settles
      setTimeout(() => {
        if (!cancelled) handleGenerateRef.current?.({ requestText, autoSend: false });
      }, 400);
    })();
    return () => { cancelled = true; };
  }, [requestText]);

  const handleGenerateRef = useRef(null);

  const handleGenerate = useCallback(async (opts = {}) => {
    const tid = opts.templateId ?? templateId;
    const doAutoSend = opts.autoSend ?? autoSend;
    const text = opts.requestText ?? requestText;
    if (!text.trim()) {
      Alert.alert("Required", "Paste the recruiter's request first");
      return;
    }
    setGenerating(true);
    try {
      const data = await generateDetailReply({
        requestText: text,
        recipientName,
        recipientEmail,
        templateId: tid || undefined,
      });
      setSubject(data.subject || "");
      setBody(data.body || "");
      if (doAutoSend && recipientEmail.trim()) {
        if (!requireGmail()) {
          setGenerating(false);
          return;
        }
        const result = await sendMail({
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          subject: data.subject || "",
          message: data.body || "",
          resumeId: resumeId || undefined,
          emailType,
          isAiGenerated: true,
        });
        const sent = result?.results?.filter((r) => r.status === "sent").length || 0;
        Alert.alert(sent > 0 ? "Sent" : "Not sent", sent > 0 ? "Reply generated and sent" : "Reply generated but send failed");
      } else {
        Alert.alert("Drafted", "Reply drafted - review and send");
      }
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || err.message || "Failed to generate reply");
    } finally {
      setGenerating(false);
    }
  }, [templateId, autoSend, recipientName, recipientEmail, resumeId, emailType, requireGmail, requestText]);
  handleGenerateRef.current = handleGenerate;

  // Auto-draft when the toggle is on
  useEffect(() => {
    if (!autoDraft || requestText.trim().length < 20) return;
    const t = setTimeout(() => {
      const tid = templateId || (templates.length ? templates[0]._id : "");
      if (!templateId && tid) setTemplateId(tid);
      handleGenerate({ templateId: tid || undefined, autoSend });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestText, autoDraft, templates, autoSend]);

  const handleSend = async () => {
    if (!requireGmail()) return;
    if (!recipientEmail.trim() || !subject.trim() || !body.trim()) {
      Alert.alert("Required", "Recipient email, subject and body are required");
      return;
    }
    setSending(true);
    try {
      const result = await sendMail({
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim(),
        subject,
        message: body,
        resumeId: resumeId || undefined,
        emailType,
        isAiGenerated: true,
      });
      const sent = result?.results?.filter((r) => r.status === "sent").length || 0;
      Alert.alert(sent > 0 ? "Sent" : "Failed", sent > 0 ? "Reply sent" : "Failed to send reply");
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || err.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Reply to Recruiter</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: "#2563eb" }}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: "#6b7280", fontSize: 12 }}>
          Paste what the HR asked, and AI drafts a reply using your profile details (CTC, notice period, experience, ...).
        </Text>

        {!user?.gmailConnected ? (
          <View style={{ borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", borderRadius: 8, padding: 12 }}>
            <Text style={{ color: "#b45309", fontSize: 12 }}>
              Gmail is not connected. You can draft replies, but connect Gmail in Profile to send.
            </Text>
          </View>
        ) : null}

        <Text style={{ fontWeight: "600" }}>Recruiter&apos;s request</Text>
        <TextInput
          placeholder={"e.g.\nHi Manish,\nCould you please share:\n- Total experience\n- Current & expected CTC\n- Notice period"}
          value={requestText}
          onChangeText={setRequestText}
          multiline
          numberOfLines={8}
          style={[input, { height: 160, textAlignVertical: "top" }]}
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: "#6b7280" }}>Auto-draft reply as I type</Text>
          <Switch value={autoDraft} onValueChange={setAutoDraft} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: "#6b7280" }}>Auto-send after drafting</Text>
          <Switch value={autoSend} onValueChange={setAutoSend} />
        </View>

        <Text style={{ color: "#6b7280", fontSize: 12 }}>Recipient (HR) email</Text>
        <TextInput placeholder="hr@company.com" value={recipientEmail} onChangeText={setRecipientEmail} autoCapitalize="none" keyboardType="email-address" style={input} />
        <Text style={{ color: "#6b7280", fontSize: 12 }}>Recipient name</Text>
        <TextInput placeholder="Pragya Shri" value={recipientName} onChangeText={setRecipientName} style={input} />

        <View style={{ borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 8, paddingTop: 8, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "600" }}>Drafted reply</Text>
            <TouchableOpacity onPress={() => handleGenerate()} disabled={generating || !requestText.trim()} style={[btnWarn, { opacity: generating || !requestText.trim() ? 0.5 : 1 }]}>
              <Text style={btnText}>{generating ? "Drafting..." : "Draft with AI"}</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: "#6b7280", fontSize: 12 }}>Template</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity onPress={() => setTemplateId("")} style={chip(templateId === "")}>
              <Text style={chipText(templateId === "")}>No template (auto)</Text>
            </TouchableOpacity>
            {templates.map((t) => (
              <TouchableOpacity key={t._id} onPress={() => setTemplateId(t._id)} style={chip(templateId === t._id)}>
                <Text style={chipText(templateId === t._id)}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={{ color: "#6b7280", fontSize: 12 }}>Subject</Text>
          <TextInput value={subject} onChangeText={setSubject} style={input} />
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Body</Text>
          <TextInput value={body} onChangeText={setBody} multiline numberOfLines={10} style={[input, { height: 200, textAlignVertical: "top" }]} />

          {body.trim() ? (
            <>
              <Text style={{ color: "#6b7280", fontSize: 12 }}>Attach resume</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setResumeId("")} style={chip(resumeId === "")}>
                  <Text style={chipText(resumeId === "")}>No resume</Text>
                </TouchableOpacity>
                {resumes.map((r) => (
                  <TouchableOpacity key={r._id} onPress={() => setResumeId(r._id)} style={chip(resumeId === r._id)}>
                    <Text style={chipText(resumeId === r._id)}>{r.originalName}{r.isDefault ? " (default)" : ""}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={{ color: "#6b7280", fontSize: 12 }}>Email type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TYPES.map((t) => (
                  <TouchableOpacity key={t} onPress={() => setEmailType(t)} style={chip(emailType === t)}>
                    <Text style={chipText(emailType === t)}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={handleSend} disabled={sending || !subject.trim() || !body.trim()} style={[btn, { opacity: sending || !subject.trim() || !body.trim() ? 0.5 : 1 }]}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={btnText}>Send reply</Text>}
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 6, marginTop: 8 }}>
          <Text style={{ fontWeight: "600" }}>Tips</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>- Make sure your profile has current/expected CTC, notice period and total experience.</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>- Pick a template to match your company&apos;s email style.</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>- CTC/experience values come only from your profile - no guesswork.</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>- Gmail must be connected before sending.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12 };
const btn = { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center" };
const btnWarn = { backgroundColor: "#d97706", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
const chip = (active) => ({ borderWidth: 1, borderColor: active ? "#2563eb" : "#e5e7eb", backgroundColor: active ? "#eff6ff" : "#fff", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 });
const chipText = (active) => ({ color: active ? "#2563eb" : "#374151", fontSize: 12 });
