import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { useState } from "react";
import { createApplication } from "../../api/applications";
import { parseLinkedIn, generateEmail } from "../../api/ai";
import { listResumes } from "../../api/resumes";
import { sendMail } from "../../api/emails";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

const ROLE_KEYWORDS = [
  ["java", "spring", "spring boot", "j2ee", "hibernate"],
  ["react", "reactjs", "react.js"],
  ["frontend", "front end", "front-end", "angular", "vue", "javascript", "typescript"],
  ["fullstack", "full stack", "full-stack", "mean", "mern"],
  ["backend", "back end", "back-end", "node", "django", "express"],
  ["devops", "aws", "cloud", "sre", "infrastructure"],
  ["data", "ml", "machine learning", "ai", "analytics"],
  ["mobile", "android", "ios", "flutter", "react native"],
];

function matchResume(jobTitle, jobDesc, requiredSkills = [], resumes = []) {
  const jobText = `${jobTitle} ${jobDesc} ${(requiredSkills || []).join(" ")}`.toLowerCase();
  const titleText = (jobTitle || "").toLowerCase();
  const resumeText = (r) => `${r.originalName || ""} ${r.notes || ""}`.toLowerCase();
  const matchedGroups = ROLE_KEYWORDS.filter((kw) => kw.some((k) => titleText.includes(k)));
  const descGroups = matchedGroups.length
    ? matchedGroups
    : ROLE_KEYWORDS.filter((kw) => kw.some((k) => jobText.includes(k)));
  const allKw = descGroups.flat();
  let selected = allKw.length ? resumes.find((r) => allKw.some((k) => resumeText(r).includes(k))) : null;
  if (!selected) selected = resumes.find((r) => r.isDefault) || resumes[0];
  return selected;
}

export default function NewApplication() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [form, setForm] = useState({
    jobTitle: "",
    companyName: "",
    jobDescription: "",
    location: "",
    jobUrl: "",
    salary: "",
    experienceRequired: "",
    requiredSkills: "",
    hrName: "",
    hrEmail: "",
    hrPhone: "",
    workMode: "",
    priority: "Medium",
  });
  const [linkedinText, setLinkedinText] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const requireGmail = () => {
    if (!user?.gmailConnected) {
      Alert.alert(
        "Gmail not connected",
        "Connect your Gmail in Profile → Gmail Connection before using Auto send."
      );
      return false;
    }
    return true;
  };

  const handleParse = async () => {
    if (!linkedinText.trim()) {
      Alert.alert("Paste text", "Paste a LinkedIn job post or recruiter message first.");
      return;
    }
    setParsing(true);
    setErr("");
    try {
      const data = await parseLinkedIn(linkedinText);
      const next = { ...form };
      const merge = (key, value) => {
        if (value && String(value).trim()) next[key] = String(value).trim();
      };
      merge("jobTitle", data.jobTitle);
      merge("companyName", data.companyName);
      merge("jobDescription", data.jobDescription);
      merge("location", data.location);
      merge("experienceRequired", data.experienceRequired);
      merge("salary", data.salary);
      merge("hrName", data.hrName);
      merge("hrEmail", data.hrEmail);
      merge("hrPhone", data.hrPhone);
      merge("workMode", data.workMode);
      if (Array.isArray(data.requiredSkills) && data.requiredSkills.length) {
        next.requiredSkills = data.requiredSkills.join(", ");
      }
      if (data.jobUrl) next.jobUrl = data.jobUrl;
      setForm(next);
      Alert.alert("Extracted", "Job details filled from LinkedIn text.");
    } catch (e) {
      if (e?.response?.status === 403) {
        Alert.alert("Feature disabled", e?.response?.data?.message || "Quick Fill is disabled for your account.");
      } else {
        setErr(e?.response?.data?.message || e.message || "Parse failed");
      }
    } finally {
      setParsing(false);
    }
  };

  const buildPayload = () => ({
    jobTitle: form.jobTitle.trim(),
    companyName: form.companyName.trim(),
    jobDescription: form.jobDescription,
    location: form.location,
    jobUrl: form.jobUrl,
    salary: form.salary,
    experienceRequired: form.experienceRequired,
    requiredSkills: form.requiredSkills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    hrName: form.hrName,
    hrEmail: form.hrEmail,
    hrPhone: form.hrPhone,
    workMode: form.workMode,
    priority: form.priority,
    status: "NEW",
    source: linkedinText ? "LinkedIn" : "Manual",
  });

  const onSaveOnly = async () => {
    setErr("");
    if (!form.jobTitle.trim() || !form.companyName.trim()) {
      setErr("Job title and company name are required");
      return;
    }
    setLoading(true);
    try {
      await createApplication(buildPayload());
      Alert.alert("Saved", "Application created");
      router.replace("/(tabs)/applications");
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  const onAutoProcess = async () => {
    setErr("");
    if (!form.jobTitle.trim() || !form.companyName.trim()) {
      setErr("Job title and company name are required");
      return;
    }
    if (!requireGmail()) return;
    if (!form.hrEmail.trim()) {
      Alert.alert("Missing email", "HR / recruiter email is required to send.");
      return;
    }
    setLoading(true);
    try {
      setStep("Generating email...");
      const emailData = await generateEmail({
        jobTitle: form.jobTitle,
        companyName: form.companyName,
        jobDescription: form.jobDescription,
        recruiterName: form.hrName,
      });

      setStep("Selecting resume...");
      const resumesRes = await listResumes();
      const resumeList = Array.isArray(resumesRes) ? resumesRes : resumesRes.resumes || [];
      if (!resumeList.length) {
        Alert.alert("No resume", "Upload a resume on the Profile tab first.");
        return;
      }
      const skills = form.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
      const resume = matchResume(form.jobTitle, form.jobDescription, skills, resumeList);
      if (!resume) {
        Alert.alert("No resume", "Could not match a resume.");
        return;
      }

      setStep("Saving application...");
      const payload = { ...buildPayload(), status: "EMAIL_SENT" };
      const app = await createApplication(payload);
      const application = app.application || app;

      setStep("Sending email...");
      await sendMail({
        to: form.hrEmail.trim(),
        recipientName: form.hrName.trim(),
        subject: emailData.subject,
        message: emailData.body,
        resumeId: resume._id,
        applicationId: application._id,
        emailType: "Job Application",
        isAiGenerated: true,
      });

      Alert.alert("Done", "Application saved and email sent from your Gmail.");
      router.replace("/(tabs)/applications");
    } catch (e) {
      if (e?.response?.status === 403) {
        Alert.alert("Blocked", e?.response?.data?.message || "This feature is disabled for your account.");
      } else {
        setErr(e?.response?.data?.message || e.message || "Auto process failed");
      }
    } finally {
      setLoading(false);
      setStep("");
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
  const labelStyle = { color: colors.textMuted, fontSize: 12, marginBottom: 4 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>New Application</Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
            gap: 8,
            backgroundColor: colors.card,
          }}
        >
          <Text style={{ fontWeight: "600", color: colors.text }}>Quick Fill from LinkedIn</Text>
          <TextInput
            placeholder="Paste LinkedIn job post or recruiter message..."
            value={linkedinText}
            onChangeText={setLinkedinText}
            multiline
            numberOfLines={5}
            style={[inputStyle, { height: 110, textAlignVertical: "top" }]}
            placeholderTextColor={colors.textMuted}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch value={autoMode} onValueChange={setAutoMode} />
            <Text style={{ color: colors.text, fontSize: 13 }}>Auto: Generate, Save & Send</Text>
          </View>
          <TouchableOpacity
            onPress={handleParse}
            disabled={parsing}
            style={{ backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center" }}
          >
            {parsing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600" }}>Extract with AI</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={labelStyle}>Job Title *</Text>
        <TextInput
          placeholder="e.g. Senior React Developer"
          value={form.jobTitle}
          onChangeText={(v) => set("jobTitle", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Company Name *</Text>
        <TextInput
          placeholder="Company"
          value={form.companyName}
          onChangeText={(v) => set("companyName", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Location</Text>
        <TextInput
          placeholder="City / Remote"
          value={form.location}
          onChangeText={(v) => set("location", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Work Mode</Text>
        <TextInput
          placeholder="Remote / Hybrid / Onsite"
          value={form.workMode}
          onChangeText={(v) => set("workMode", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Salary</Text>
        <TextInput
          placeholder="e.g. 15-25 LPA"
          value={form.salary}
          onChangeText={(v) => set("salary", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Experience Required</Text>
        <TextInput
          placeholder="e.g. 3-5 years"
          value={form.experienceRequired}
          onChangeText={(v) => set("experienceRequired", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Required Skills (comma separated)</Text>
        <TextInput
          placeholder="React, Node, MongoDB"
          value={form.requiredSkills}
          onChangeText={(v) => set("requiredSkills", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Job URL</Text>
        <TextInput
          placeholder="https://..."
          value={form.jobUrl}
          onChangeText={(v) => set("jobUrl", v)}
          autoCapitalize="none"
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Job Description</Text>
        <TextInput
          placeholder="Paste full JD"
          value={form.jobDescription}
          onChangeText={(v) => set("jobDescription", v)}
          multiline
          numberOfLines={6}
          style={[inputStyle, { height: 120, textAlignVertical: "top" }]}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={{ fontWeight: "600", color: colors.text, marginTop: 4 }}>HR / Recruiter</Text>
        <Text style={labelStyle}>Name</Text>
        <TextInput
          placeholder="Recruiter name"
          value={form.hrName}
          onChangeText={(v) => set("hrName", v)}
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Email</Text>
        <TextInput
          placeholder="recruiter@company.com"
          value={form.hrEmail}
          onChangeText={(v) => set("hrEmail", v)}
          autoCapitalize="none"
          keyboardType="email-address"
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={labelStyle}>Phone</Text>
        <TextInput
          placeholder="Phone"
          value={form.hrPhone}
          onChangeText={(v) => set("hrPhone", v)}
          keyboardType="phone-pad"
          style={inputStyle}
          placeholderTextColor={colors.textMuted}
        />

        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        {step ? <Text style={{ color: colors.primary }}>{step}</Text> : null}

        {autoMode ? (
          <TouchableOpacity
            onPress={onAutoProcess}
            disabled={loading}
            style={{ backgroundColor: colors.success, padding: 14, borderRadius: 8, alignItems: "center" }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600" }}>Generate, Save & Send</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onSaveOnly}
            disabled={loading}
            style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 8, alignItems: "center" }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600" }}>Save Application</Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ borderColor: colors.primary, borderWidth: 1, padding: 12, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
