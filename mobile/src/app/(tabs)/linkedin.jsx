import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Platform } from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, router } from "expo-router";
import { saveLinkedInPost } from "../../utils/savePipeline";
import { generateEmail, generateDetailReply } from "../../api/ai";
import { sendMail } from "../../api/emails";

// Native module only in Android EAS / run:android builds (not Expo Go)
let LinkedInOverlay = null;
function loadOverlayModule() {
  if (Platform.OS !== "android") return null;
  try {
    const mod = require("linkedin-overlay");
    const api = mod?.default ?? mod;
    if (api && typeof api.isModuleAvailable === "function") {
      return api.isModuleAvailable() ? api : null;
    }
    // Native present if permission API exists
    if (api && typeof api.hasOverlayPermission === "function") {
      try {
        api.hasOverlayPermission();
        return api;
      } catch {
        return null;
      }
    }
    return api || null;
  } catch {
    try {
      const mod = require("../../../modules/linkedin-overlay");
      return mod?.default ?? mod;
    } catch {
      return null;
    }
  }
}
LinkedInOverlay = loadOverlayModule();

const DEFAULT_LINKEDIN_LABEL = "Save to JobTrackr";
const DEFAULT_GMAIL_LABEL = "HR Reply (Gmail)";
const COLOR_LINKEDIN = "#2563eb";
const COLOR_GMAIL = "#EA4335";
const COLOR_BUSY = "#f59e0b";
const COLOR_QUEUE = "#7c3aed";
const COLOR_OK = "#059669";
const COLOR_ERR = "#dc2626";

export default function LinkedInSetup() {
  const [autoSendApplication, setAutoSendApplication] = useState(false);
  const [autoSendGmail, setAutoSendGmail] = useState(false);
  const [captureActive, setCaptureActive] = useState(false);
  const [hasOverlay, setHasOverlay] = useState(false);
  const [hasAccessibility, setHasAccessibility] = useState(false);
  const [status, setStatus] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const [queueLength, setQueueLength] = useState(0);

  const listenersRef = useRef([]);
  const queueRef = useRef([]); // pending payloads
  const processingRef = useRef(false);
  const currentModeRef = useRef("linkedin");

  const refreshPermissions = useCallback(async () => {
    if (!LinkedInOverlay) return;
    try {
      setHasOverlay(!!LinkedInOverlay.hasOverlayPermission());
      setHasAccessibility(!!LinkedInOverlay.isAccessibilityEnabled());
      setCaptureActive(!!(await LinkedInOverlay.isCaptureActive()));
    } catch {
      // ignore
    }
  }, []);

  const restoreDefaultOverlay = useCallback((mode) => {
    const m = mode || currentModeRef.current || "linkedin";
    if (m === "gmail") {
      LinkedInOverlay?.setOverlayStatus?.(DEFAULT_GMAIL_LABEL, COLOR_GMAIL);
    } else {
      LinkedInOverlay?.setOverlayStatus?.(DEFAULT_LINKEDIN_LABEL, COLOR_LINKEDIN);
    }
  }, []);

  /**
   * Process one payload. When done, drain next from queue.
   * While processing, additional taps are queued and overlay shows "Queued (N)".
   */
  const processNext = useCallback(async () => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    setQueueLength(queueRef.current.length);
    if (!next) {
      restoreDefaultOverlay(currentModeRef.current);
      return;
    }

    processingRef.current = true;
    const { text, url, mode, to, from, subject, body } = next || {};
    currentModeRef.current = mode === "gmail" ? "gmail" : "linkedin";

    try {
      if (mode === "gmail") {
        setStatus("Processing Gmail capture...");
        LinkedInOverlay?.setOverlayStatus?.("Processing...", COLOR_BUSY);

        const requestText = (body || text || "").trim();
        if (requestText.length < 20) {
          throw new Error("Gmail body too short — open the full message");
        }
        // For an open inbox message, reply goes to the sender (from)
        const recipientEmail = (from || to || "").trim();
        const draftPayload = {
          requestText,
          recipientEmail,
          recipientName: "",
          subject: subject || "",
          fromGmail: true,
        };
        await AsyncStorage.setItem("jt_hr_reply_draft", JSON.stringify(draftPayload));

        const autoGmail = (await AsyncStorage.getItem("autoSendGmail")) === "true";
        if (autoGmail && requestText) {
          // Auto-generate + send if possible; otherwise open HR Reply
          try {
            LinkedInOverlay?.setOverlayStatus?.("Generating reply...", COLOR_BUSY);
            let draft;
            try {
              draft = await generateDetailReply({
                requestText,
                recipientEmail,
                subject: subject || "",
              });
            } catch {
              draft = await generateEmail({
                requestText,
                recipientEmail,
                emailType: "Recruiter Response",
              });
            }
            if (draft?.subject || draft?.body) {
              if (recipientEmail) {
                LinkedInOverlay?.setOverlayStatus?.("Sending...", COLOR_BUSY);
                await sendMail({
                  recipientEmail,
                  recipientName: "",
                  subject: draft.subject || subject || "Re: your message",
                  message: draft.body || draft.message || "",
                  emailType: "Recruiter Response",
                  isAiGenerated: true,
                });
                setStatus("Gmail reply sent to " + recipientEmail);
                setLastSaved("Gmail → " + recipientEmail);
                LinkedInOverlay?.setOverlayStatus?.("Sent", COLOR_OK);
              } else {
                // No email — open editor with draft
                if (draft.subject) draftPayload.subject = draft.subject;
                if (draft.body) draftPayload.requestText = draft.body;
                await AsyncStorage.setItem("jt_hr_reply_draft", JSON.stringify(draftPayload));
                LinkedInOverlay?.setOverlayStatus?.("Open HR Reply", COLOR_GMAIL);
                router.push("/hr-reply");
                setStatus("Opened HR Reply (no recipient email found)");
              }
            } else {
              LinkedInOverlay?.setOverlayStatus?.("Open HR Reply", COLOR_GMAIL);
              router.push("/hr-reply");
              setStatus("Opened HR Reply for Gmail");
            }
          } catch (e) {
            // Fallback: open HR Reply screen
            LinkedInOverlay?.setOverlayStatus?.("Open HR Reply", COLOR_GMAIL);
            router.push("/hr-reply");
            setStatus("Opened HR Reply (auto-send skipped: " + (e?.message || "error") + ")");
          }
        } else {
          // Save only — open HR Reply for manual review
          LinkedInOverlay?.setOverlayStatus?.("Open HR Reply", COLOR_GMAIL);
          router.push("/hr-reply");
          setStatus("Opened HR Reply for Gmail (auto-send off)");
        }
      } else {
        // LinkedIn application save
        setStatus("Saving captured post...");
        LinkedInOverlay?.setOverlayStatus?.("Saving...", COLOR_BUSY);
        const app = await saveLinkedInPost({ text, url });
        const title = app.jobTitle || "Untitled";
        setLastSaved(title);
        if (app._autoSent) {
          setStatus("Saved & emailed: " + title);
          LinkedInOverlay?.setOverlayStatus?.("Saved + Sent", COLOR_OK);
        } else {
          setStatus("Saved: " + title);
          LinkedInOverlay?.setOverlayStatus?.("Saved", COLOR_OK);
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "unknown";
      setStatus("Error: " + msg);
      LinkedInOverlay?.setOverlayStatus?.("Failed", COLOR_ERR);
    } finally {
      // Brief success/error state, then either process queue or restore default
      await new Promise((r) => setTimeout(r, 1200));
      processingRef.current = false;
      if (queueRef.current.length > 0) {
        setQueueLength(queueRef.current.length);
        LinkedInOverlay?.setOverlayStatus?.(
          `Queued (${queueRef.current.length})…`,
          COLOR_QUEUE
        );
        // Continue draining without long delay
        processNext();
      } else {
        setQueueLength(0);
        restoreDefaultOverlay(currentModeRef.current);
      }
    }
  }, [restoreDefaultOverlay]);

  const enqueuePayload = useCallback(
    (payload) => {
      const mode = payload?.mode === "gmail" ? "gmail" : "linkedin";
      const text = (payload?.body || payload?.text || "").trim();
      // Ignore empty / noise captures so queue does not fill with blanks
      if (!text || text.length < 20) {
        setStatus(
          mode === "gmail"
            ? "No email content detected — open a message and try again."
            : "No post content detected — scroll to a job post and try again."
        );
        LinkedInOverlay?.setOverlayStatus?.("No content", COLOR_ERR);
        setTimeout(() => restoreDefaultOverlay(mode), 1500);
        return;
      }
      // Dedupe consecutive identical captures
      const last = queueRef.current[queueRef.current.length - 1];
      if (last && (last.body || last.text) === text && last.mode === mode) {
        setStatus("Already queued (same content)");
        return;
      }
      currentModeRef.current = mode;

      if (processingRef.current) {
        queueRef.current.push(payload);
        setQueueLength(queueRef.current.length);
        LinkedInOverlay?.setOverlayStatus?.(
          `Queued (${queueRef.current.length})`,
          COLOR_QUEUE
        );
        setStatus(
          `Busy — added to queue (${queueRef.current.length} waiting). You can keep scrolling.`
        );
        return;
      }
      queueRef.current.push(payload);
      setQueueLength(queueRef.current.length);
      processNext();
    },
    [processNext, restoreDefaultOverlay]
  );

  useEffect(() => {
    (async () => {
      // Migrate legacy "autoSend" → application toggle
      const legacy = await AsyncStorage.getItem("autoSend");
      let appFlag = await AsyncStorage.getItem("autoSendApplication");
      if (appFlag == null && legacy === "true") {
        await AsyncStorage.setItem("autoSendApplication", "true");
        appFlag = "true";
      }
      setAutoSendApplication(appFlag === "true");
      const gmailFlag = await AsyncStorage.getItem("autoSendGmail");
      setAutoSendGmail(gmailFlag === "true");
    })();

    if (LinkedInOverlay?.addPostScrapedListener) {
      const sub1 = LinkedInOverlay.addPostScrapedListener((payload) => {
        enqueuePayload(payload || {});
      });
      const sub2 = LinkedInOverlay.addStatusListener?.(({ status: s, accessibilityEnabled, message }) => {
        if (s === "started") {
          setCaptureActive(true);
          setHasAccessibility(!!accessibilityEnabled);
          setStatus(
            accessibilityEnabled
              ? "Capture active. Open LinkedIn or Gmail and tap the floating button."
              : "Overlay shown, but Accessibility Service is OFF. Enable it in settings."
          );
        } else if (s === "stopped") {
          setCaptureActive(false);
          setStatus("Capture stopped");
          queueRef.current = [];
          setQueueLength(0);
          processingRef.current = false;
        } else if (s === "needsOverlayPermission") {
          setStatus("Please grant 'Display over other apps' permission");
        } else if (s === "error") {
          setStatus("Error starting overlay: " + (message || "unknown"));
        }
      });
      listenersRef.current = [sub1, sub2].filter(Boolean);
    }

    return () => {
      listenersRef.current.forEach((l) => l?.remove?.());
      listenersRef.current = [];
    };
  }, [enqueuePayload]);

  useFocusEffect(
    useCallback(() => {
      refreshPermissions();
    }, [refreshPermissions])
  );

  const onStart = async () => {
    if (!LinkedInOverlay) {
      Alert.alert(
        "Not available",
        "The LinkedIn/Gmail capture module requires a development build (not Expo Go). Run 'npx expo run:android' or build with EAS."
      );
      return;
    }
    try {
      await LinkedInOverlay.startCapture();
      setTimeout(refreshPermissions, 500);
    } catch (e) {
      Alert.alert("Start failed", e?.message || "Unknown error");
    }
  };

  const onStop = async () => {
    if (!LinkedInOverlay) return;
    try {
      await LinkedInOverlay.stopCapture();
      queueRef.current = [];
      setQueueLength(0);
      processingRef.current = false;
      setCaptureActive(false);
      setStatus("Capture stopped");
    } catch (e) {
      Alert.alert("Stop failed", e?.message || "Unknown error");
    }
  };

  const openOverlaySettings = async () => {
    if (!LinkedInOverlay) {
      Alert.alert(
        "Build required",
        "Overlay permissions only work in a real Android build (EAS preview/development or npx expo run:android). Expo Go cannot load this module."
      );
      return;
    }
    try {
      await LinkedInOverlay.openOverlaySettings();
    } catch (e) {
      Alert.alert("Could not open settings", e?.message || "Open Settings → Apps → JobTrackr → Display over other apps");
    }
  };

  const openAccessibilitySettings = async () => {
    if (!LinkedInOverlay) {
      Alert.alert(
        "Build required",
        "Accessibility service only works in a real Android build (EAS preview/development). Install the APK from expo.dev, not Expo Go."
      );
      return;
    }
    try {
      await LinkedInOverlay.openAccessibilitySettings();
    } catch (e) {
      Alert.alert("Could not open settings", e?.message || "Open Settings → Accessibility → JobTrackr LinkedIn Capture");
    }
  };

  const toggleAutoSendApplication = async (v) => {
    setAutoSendApplication(v);
    await AsyncStorage.setItem("autoSendApplication", v ? "true" : "false");
    // Keep legacy key in sync for older code paths
    await AsyncStorage.setItem("autoSend", v ? "true" : "false");
  };

  const toggleAutoSendGmail = async (v) => {
    setAutoSendGmail(v);
    await AsyncStorage.setItem("autoSendGmail", v ? "true" : "false");
  };

  const btn = {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  };
  const btnStop = { ...btn, backgroundColor: "#dc2626" };
  const btnText = { color: "#fff", fontWeight: "600" };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>LinkedIn & Gmail Capture</Text>
        <Text style={{ color: "#6b7280", fontSize: 13 }}>
          Floating overlay works in both LinkedIn (save jobs) and Gmail (HR reply). Taps while
          busy are queued so you can keep scrolling.
        </Text>

        {!LinkedInOverlay ? (
          <View
            style={{
              backgroundColor: "#fef3c7",
              borderColor: "#f59e0b",
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text style={{ color: "#92400e", fontSize: 13 }}>
              Native overlay module not loaded.

              You are running Expo Go or a build without the native module. Install the APK from your EAS build on expo.dev (profile: preview or development), or run: npx expo run:android

              Expo Go cannot show the floating button or grant overlay/accessibility.
            </Text>
          </View>
        ) : null}

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "600" }}>1. Overlay Permission</Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: hasOverlay ? "#059669" : "#dc2626",
              }}
            >
              {hasOverlay ? "Granted" : "Not granted"}
            </Text>
          </View>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Allow &quot;Display over other apps&quot; so the floating Save / HR Reply button can
            appear on LinkedIn and Gmail.
          </Text>
          <TouchableOpacity onPress={openOverlaySettings} style={btn}>
            <Text style={btnText}>
              {hasOverlay ? "Manage Overlay Permission" : "Grant Overlay Permission"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "600" }}>2. Accessibility Service</Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: hasAccessibility ? "#059669" : "#dc2626",
              }}
            >
              {hasAccessibility ? "Enabled" : "Not enabled"}
            </Text>
          </View>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Enable &quot;JobTrackr LinkedIn Capture&quot; under Accessibility. It reads the visible
            post / email text when you tap the button.
          </Text>
          <TouchableOpacity onPress={openAccessibilitySettings} style={btn}>
            <Text style={btnText}>
              {hasAccessibility ? "Manage Accessibility Service" : "Open Accessibility Settings"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>3. Start / Stop Capture</Text>
          {!hasOverlay ? (
            <Text style={{ color: "#dc2626", fontSize: 12 }}>
              Grant Overlay Permission (step 1) before starting.
            </Text>
          ) : null}
          <TouchableOpacity onPress={captureActive ? onStop : onStart} style={captureActive ? btnStop : btn}>
            <Text style={btnText}>{captureActive ? "Stop Capture" : "Start Capture"}</Text>
          </TouchableOpacity>
          {status ? <Text style={{ color: "#374151", fontSize: 12 }}>{status}</Text> : null}
          {lastSaved ? (
            <Text style={{ color: "#059669", fontSize: 12 }}>Last: {lastSaved}</Text>
          ) : null}
          {queueLength > 0 ? (
            <Text style={{ color: "#7c3aed", fontSize: 12, fontWeight: "600" }}>
              Queue: {queueLength} waiting
            </Text>
          ) : null}
        </View>

        {/* Two separate auto-send checkboxes */}
        <View
          style={{
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 8,
            padding: 12,
            gap: 14,
          }}
        >
          <Text style={{ fontWeight: "600", marginBottom: 2 }}>Auto-send options</Text>
          <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>
            If unchecked, the capture is only saved (or opened for review). If checked, the app
            also sends the email automatically when possible.
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontWeight: "600" }}>Application auto-send</Text>
              <Text style={{ color: "#6b7280", fontSize: 12 }}>
                After saving a LinkedIn job, generate &amp; send AI application email if recruiter
                email is found
              </Text>
            </View>
            <Switch value={autoSendApplication} onValueChange={toggleAutoSendApplication} />
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "#e5e7eb",
            }}
          />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontWeight: "600" }}>Gmail auto-send</Text>
              <Text style={{ color: "#6b7280", fontSize: 12 }}>
                When tapping overlay on an open Gmail message, auto-generate &amp; send HR reply.
                If off, opens HR Reply screen to review first.
              </Text>
            </View>
            <Switch value={autoSendGmail} onValueChange={toggleAutoSendGmail} />
          </View>
        </View>

        <Text style={{ color: "#6b7280", fontSize: 12 }}>
          After starting capture, open LinkedIn or Gmail. A floating pill appears (blue for jobs,
          red for Gmail). Drag it anywhere. Tap when a job post or email is visible. While one item
          is saving/sending, further taps go into a queue — you can keep scrolling. When finished,
          the next queued item runs automatically and the button returns to Save / HR Reply.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
