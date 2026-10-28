import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, router } from "expo-router";
import Constants from "expo-constants";
import { saveLinkedInPost } from "../../utils/savePipeline";
import { addHrDraft, listHrDrafts, removeHrDraft } from "../../utils/hrDrafts";
import { generateEmail, generateDetailReply } from "../../api/ai";
import { sendMail } from "../../api/emails";

const IS_ANDROID = Platform.OS === "android";
const IS_EXPO_GO =
  Constants.appOwnership === "expo" || Constants.expoGoConfig != null;

// Tracking/redirect URLs are sometimes rendered as visible text in Gmail.
// Strip them even if the native scraper misses one, so AI never sees them.
function sanitizeCapturedEmail(value) {
  return (value || "")
    .replace(/\b(?:https?:\/\/|www\.)\S{80,}/gi, " ")
    .replace(/\buba\?data=\S+/gi, " ")
    .replace(/\bdata=%7b\S+/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  const [pendingDrafts, setPendingDrafts] = useState([]);

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
        setStatus("Saving Gmail draft...");
        LinkedInOverlay?.setOverlayStatus?.("Saving draft...", COLOR_BUSY);

        const requestText = sanitizeCapturedEmail(body);
        if (!requestText) {
          throw new Error("Could not read the email body — open the message and try again");
        }
        if (requestText.length < 20) {
          throw new Error("Email body too short — open the full message");
        }
        const safeSubject = sanitizeCapturedEmail(subject);
        // For an open inbox message, reply goes to the sender (from)
        const recipientEmail = (from || to || "").trim();
        const draftPayload = {
          requestText,
          recipientEmail,
          recipientName: "",
          subject: safeSubject,
          fromGmail: true,
        };

        // Save the draft immediately so a tap is never lost. The user can keep
        // scrolling/capturing; review happens later from the HR Reply screen.
        const drafts = await addHrDraft(draftPayload);
        setPendingDrafts(drafts);
        const draftId = drafts.find((d) => d.requestText === requestText)?.id;
        setLastSaved(safeSubject ? "Gmail: " + safeSubject : "Gmail draft");
        setStatus(
          `Gmail draft saved (${drafts.length} pending). Open Reply to Recruiter to review.`
        );
        LinkedInOverlay?.setOverlayStatus?.("Draft saved", COLOR_OK);

        const autoGmail = (await AsyncStorage.getItem("autoSendGmail")) === "true";
        if (!autoGmail) {
          // Manual review later — do not open the app or interrupt browsing.
        } else if (!recipientEmail) {
          setStatus("Gmail draft saved — no recipient email found. Add it in Reply to Recruiter.");
        } else {
          // Auto-generate + send in the background. The draft is already saved,
          // so the queue can move on to the next capture immediately.
          void (async () => {
            try {
              LinkedInOverlay?.setOverlayStatus?.("Generating reply...", COLOR_BUSY);
              let generated;
              try {
                generated = await generateDetailReply({
                  requestText,
                  recipientEmail,
                  subject: safeSubject,
                });
              } catch {
                generated = await generateEmail({
                  requestText,
                  recipientEmail,
                  emailType: "Recruiter Response",
                });
              }
              if (!generated?.subject && !generated?.body) {
                throw new Error("AI returned an empty reply");
              }
              LinkedInOverlay?.setOverlayStatus?.("Sending...", COLOR_BUSY);
              await sendMail({
                recipientEmail,
                recipientName: "",
                subject: generated.subject || safeSubject || "Re: your message",
                message: generated.body || generated.message || "",
                emailType: "Recruiter Response",
                isAiGenerated: true,
              });
              if (draftId) {
                const remaining = await removeHrDraft(draftId);
                setPendingDrafts(remaining);
              }
              setStatus("Gmail reply sent to " + recipientEmail);
              setLastSaved("Gmail → " + recipientEmail);
              if (!processingRef.current && queueRef.current.length === 0) {
                LinkedInOverlay?.setOverlayStatus?.("Sent", COLOR_OK);
              }
            } catch (e) {
              setStatus(
                "Gmail draft saved, auto-send failed: " + (e?.message || "error")
              );
              if (!processingRef.current && queueRef.current.length === 0) {
                LinkedInOverlay?.setOverlayStatus?.("Draft saved", COLOR_OK);
              }
            }
          })();
        }
      } else {
        // LinkedIn application save
        setStatus("Saving captured post...");
        LinkedInOverlay?.setOverlayStatus?.("Saving...", COLOR_BUSY);
        const app = await saveLinkedInPost({
          text,
          url,
          onAutoSend: (saved) => {
            const savedTitle = saved.jobTitle || "Untitled";
            setLastSaved(savedTitle);
            if (saved._autoSent) {
              setStatus("Saved & emailed: " + savedTitle);
              if (!processingRef.current && queueRef.current.length === 0) {
                LinkedInOverlay?.setOverlayStatus?.("Saved + Sent", COLOR_OK);
              }
            } else {
              setStatus(
                "Saved without email: " + (saved._autoSendError || "email not sent")
              );
              if (!processingRef.current && queueRef.current.length === 0) {
                LinkedInOverlay?.setOverlayStatus?.("Saved (no email)", COLOR_OK);
              }
            }
          },
        });
        const title = app.jobTitle || "Untitled";
        setLastSaved(title);
        if (app._autoSent) {
          setStatus("Saved & emailed: " + title);
          LinkedInOverlay?.setOverlayStatus?.("Saved + Sent", COLOR_OK);
        } else if (app._autoSendPending) {
          setStatus("Saved: " + title + " — email sending in background");
          LinkedInOverlay?.setOverlayStatus?.("Saved", COLOR_OK);
        } else if (app._autoSendError) {
          setStatus("Saved without email: " + app._autoSendError);
          LinkedInOverlay?.setOverlayStatus?.("Saved (no email)", COLOR_OK);
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
      // Brief success/error state, then either process queue or restore default.
      // Drain queued captures quickly so background saving keeps up with taps.
      await new Promise((r) => setTimeout(r, queueRef.current.length > 0 ? 250 : 1200));
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
      listHrDrafts()
        .then(setPendingDrafts)
        .catch(() => {});
    }, [refreshPermissions])
  );

  const buildRequiredMessage = IS_EXPO_GO
    ? "Expo Go cannot load custom native modules. Install a preview/development APK from EAS (profile: preview) or run 'npx expo run:android' on a connected device."
    : "This build does not include the LinkedIn Overlay native module. Rebuild the app with 'npx expo run:android' or 'eas build --profile preview --platform android'.";

  const onStart = async () => {
    if (!LinkedInOverlay) {
      Alert.alert("Build required", buildRequiredMessage);
      return;
    }
    try {
      // Android 13+ requires an explicit permission for the foreground status
      // notification that shows save/send progress.
      if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
        try {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
        } catch {
          // Status notification is optional; capture still works.
        }
      }
      const started = await LinkedInOverlay.startCapture();
      if (started === false) {
        setStatus("Grant 'Display over other apps' permission, then try again.");
      }
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
      Alert.alert("Build required", buildRequiredMessage);
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
      Alert.alert("Build required", buildRequiredMessage);
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

        {!IS_ANDROID ? (
          <View
            style={{
              backgroundColor: "#eff6ff",
              borderColor: "#93c5fd",
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text style={{ color: "#1e40af", fontSize: 13 }}>
              LinkedIn &amp; Gmail capture is Android-only. iOS does not allow floating overlays or
              accessibility-based screen reading.
            </Text>
          </View>
        ) : !LinkedInOverlay ? (
          <View
            style={{
              backgroundColor: "#fef3c7",
              borderColor: "#f59e0b",
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ color: "#92400e", fontSize: 13, fontWeight: "700" }}>
              Build required — capture is unavailable in this app
            </Text>
            <Text style={{ color: "#92400e", fontSize: 12 }}>
              {IS_EXPO_GO
                ? "You are running Expo Go. Expo Go cannot load custom native modules, so the floating button and Android permissions cannot work here."
                : "This installed app does not include the LinkedIn Overlay native module."}
            </Text>
            <Text style={{ color: "#92400e", fontSize: 12, fontWeight: "600", marginTop: 4 }}>
              How to get a working build:
            </Text>
            <Text style={{ color: "#92400e", fontSize: 12 }}>
              1. Build a preview/development APK:{"\n"}
              {"   "}npx eas-cli@latest build --profile preview --platform android{"\n"}
              2. Or build locally on a connected Android device:{"\n"}
              {"   "}npx expo run:android{"\n"}
              3. Install the resulting APK (not Expo Go), then return to this screen.
            </Text>
            <Text style={{ color: "#92400e", fontSize: 11, marginTop: 2 }}>
              Steps 1–3 below stay disabled until the native module is available.
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
                color: !LinkedInOverlay ? "#6b7280" : hasOverlay ? "#059669" : "#dc2626",
              }}
            >
              {!LinkedInOverlay ? "Unavailable" : hasOverlay ? "Granted" : "Not granted"}
            </Text>
          </View>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Allow &quot;Display over other apps&quot; so the floating Save / HR Reply button can
            appear on LinkedIn and Gmail.
          </Text>
          <TouchableOpacity
            onPress={openOverlaySettings}
            disabled={!LinkedInOverlay}
            style={[btn, !LinkedInOverlay && { backgroundColor: "#9ca3af" }]}
          >
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
                color: !LinkedInOverlay ? "#6b7280" : hasAccessibility ? "#059669" : "#dc2626",
              }}
            >
              {!LinkedInOverlay ? "Unavailable" : hasAccessibility ? "Enabled" : "Not enabled"}
            </Text>
          </View>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Enable &quot;JobTrackr LinkedIn Capture&quot; under Accessibility. It reads the visible
            post / email text when you tap the button.
          </Text>
          <TouchableOpacity
            onPress={openAccessibilitySettings}
            disabled={!LinkedInOverlay}
            style={[btn, !LinkedInOverlay && { backgroundColor: "#9ca3af" }]}
          >
            <Text style={btnText}>
              {hasAccessibility ? "Manage Accessibility Service" : "Open Accessibility Settings"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>3. Start / Stop Capture</Text>
          {!LinkedInOverlay ? (
            <Text style={{ color: "#6b7280", fontSize: 12 }}>
              Start Capture becomes available after installing a build that includes the native
              module.
            </Text>
          ) : !hasOverlay ? (
            <Text style={{ color: "#dc2626", fontSize: 12 }}>
              Grant Overlay Permission (step 1) before starting.
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={captureActive ? onStop : onStart}
            disabled={!LinkedInOverlay}
            style={[captureActive ? btnStop : btn, !LinkedInOverlay && { backgroundColor: "#9ca3af" }]}
          >
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
                Every tap saves a draft first. If on and a recipient email is found, the reply is
                generated &amp; sent immediately; otherwise the draft waits for review.
              </Text>
            </View>
            <Switch value={autoSendGmail} onValueChange={toggleAutoSendGmail} />
          </View>
        </View>

        {pendingDrafts.length > 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: "#bfdbfe",
              backgroundColor: "#eff6ff",
              borderRadius: 8,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: "600", color: "#1e40af" }}>
              Pending Gmail drafts ({pendingDrafts.length})
            </Text>
            <Text style={{ color: "#1e40af", fontSize: 12 }}>
              Captured in the background. Tap a draft to review, add the recipient and send.
            </Text>
            {pendingDrafts.slice(0, 5).map((d) => (
              <TouchableOpacity
                key={d.id}
                onPress={() =>
                  router.push({ pathname: "/hr-reply", params: { draftId: d.id } })
                }
                style={{
                  backgroundColor: "#fff",
                  borderWidth: 1,
                  borderColor: "#dbeafe",
                  borderRadius: 6,
                  padding: 8,
                  gap: 2,
                }}
              >
                <Text style={{ fontWeight: "600", fontSize: 12 }} numberOfLines={1}>
                  {d.subject || "No subject"}
                </Text>
                <Text style={{ color: "#6b7280", fontSize: 11 }} numberOfLines={1}>
                  {d.recipientEmail || "No recipient email"}
                  {d.createdAt ? " · " + new Date(d.createdAt).toLocaleString() : ""}
                </Text>
              </TouchableOpacity>
            ))}
            {pendingDrafts.length > 5 ? (
              <Text style={{ color: "#1e40af", fontSize: 11 }}>
                +{pendingDrafts.length - 5} more draft(s)
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={{ color: "#6b7280", fontSize: 12 }}>
          After starting capture, open LinkedIn or Gmail. A floating pill appears (blue for jobs,
          red for Gmail). Drag it anywhere. Tap when a job post or email is visible. Taps are
          queued and processed in the background, so you can keep scrolling and capture the next
          item immediately. Gmail captures are saved as drafts instead of opening the app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
