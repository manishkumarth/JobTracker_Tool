import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Platform } from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { saveLinkedInPost } from "../../utils/savePipeline";

// The local native module is only available in a dev/EAS build (not Expo Go)
let LinkedInOverlay = null;
if (Platform.OS === "android") {
  try {
    LinkedInOverlay = require("../../modules/linkedin-overlay");
  } catch {
    LinkedInOverlay = null;
  }
}

export default function LinkedInSetup() {
  const [autoSend, setAutoSend] = useState(false);
  const [captureActive, setCaptureActive] = useState(false);
  const [hasOverlay, setHasOverlay] = useState(false);
  const [hasAccessibility, setHasAccessibility] = useState(false);
  const [status, setStatus] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const listenersRef = useRef([]);

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

  useEffect(() => {
    (async () => {
      const v = await AsyncStorage.getItem("autoSend");
      setAutoSend(v === "true");
    })();

    if (LinkedInOverlay?.addPostScrapedListener) {
      const sub1 = LinkedInOverlay.addPostScrapedListener(async ({ text, url }) => {
        setStatus("Saving captured post...");
        try {
          const app = await saveLinkedInPost({ text, url });
          setLastSaved(app.jobTitle || "Saved");
          setStatus("Saved: " + (app.jobTitle || "Untitled"));
        } catch (e) {
          setStatus("Error: " + (e?.response?.data?.message || e.message));
        }
      });
      const sub2 = LinkedInOverlay.addStatusListener?.(({ status: s, accessibilityEnabled, message }) => {
        if (s === "started") {
          setCaptureActive(true);
          setHasAccessibility(!!accessibilityEnabled);
          setStatus(
            accessibilityEnabled
              ? "Capture active. Open LinkedIn and tap the floating button."
              : "Overlay shown, but Accessibility Service is OFF. Enable it in settings."
          );
        } else if (s === "stopped") {
          setCaptureActive(false);
          setStatus("Capture stopped");
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
  }, []);

  // Re-check permission state every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      refreshPermissions();
    }, [refreshPermissions])
  );

  const onStart = async () => {
    if (!LinkedInOverlay) {
      Alert.alert("Not available", "The LinkedIn capture module requires a development build (not Expo Go). Run 'npx expo run:android' or build with EAS.");
      return;
    }
    try {
      await LinkedInOverlay.startCapture();
      setTimeout(refreshPermissions, 500);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const onStop = async () => {
    if (!LinkedInOverlay) return;
    try {
      await LinkedInOverlay.stopCapture();
      setCaptureActive(false);
      setStatus("Capture stopped");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const openOverlaySettings = async () => {
    try {
      if (LinkedInOverlay?.openOverlaySettings) {
        await LinkedInOverlay.openOverlaySettings();
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const openAccessibilitySettings = async () => {
    try {
      if (LinkedInOverlay?.openAccessibilitySettings) {
        await LinkedInOverlay.openAccessibilitySettings();
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const toggleAutoSend = async (val) => {
    setAutoSend(val);
    await AsyncStorage.setItem("autoSend", val ? "true" : "false");
  };

  if (Platform.OS !== "android") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>LinkedIn Capture</Text>
          <Text style={{ color: "#6b7280" }}>
            The LinkedIn capture overlay is only available on Android.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>LinkedIn Capture</Text>
        <Text style={{ color: "#6b7280" }}>
          Shows a floating &quot;Save to JobTrackr&quot; button on top of the LinkedIn Android app — like the Chrome extension. Tap it to capture the visible job post and save it to your tracker.
        </Text>

        {!LinkedInOverlay ? (
          <View style={{ borderWidth: 1, borderColor: "#fca5a5", backgroundColor: "#fef2f2", borderRadius: 8, padding: 12 }}>
            <Text style={{ color: "#b91c1c", fontWeight: "600" }}>Native module not available</Text>
            <Text style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
              This build does not include the capture module. Install the official JobTrackr APK.
            </Text>
          </View>
        ) : null}

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "600" }}>1. Overlay Permission</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: hasOverlay ? "#059669" : "#dc2626" }}>
              {hasOverlay ? "Granted" : "Not granted"}
            </Text>
          </View>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Lets the floating button appear over other apps (LinkedIn).</Text>
          <TouchableOpacity onPress={openOverlaySettings} style={btn}>
            <Text style={btnText}>{hasOverlay ? "Manage Overlay Permission" : "Grant Overlay Permission"}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "600" }}>2. Accessibility Service</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: hasAccessibility ? "#059669" : "#dc2626" }}>
              {hasAccessibility ? "Enabled" : "Not enabled"}
            </Text>
          </View>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Enable &quot;JobTrackr LinkedIn Capture&quot; under Accessibility. It reads the visible post text when you tap the button.
          </Text>
          <TouchableOpacity onPress={openAccessibilitySettings} style={btn}>
            <Text style={btnText}>{hasAccessibility ? "Manage Accessibility Service" : "Open Accessibility Settings"}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>3. Start / Stop Capture</Text>
          {!hasOverlay ? (
            <Text style={{ color: "#dc2626", fontSize: 12 }}>Grant Overlay Permission (step 1) before starting.</Text>
          ) : null}
          <TouchableOpacity onPress={captureActive ? onStop : onStart} style={captureActive ? btnStop : btn}>
            <Text style={btnText}>{captureActive ? "Stop Capture" : "Start Capture"}</Text>
          </TouchableOpacity>
          {status ? <Text style={{ color: "#374151", fontSize: 12 }}>{status}</Text> : null}
          {lastSaved ? <Text style={{ color: "#059669", fontSize: 12 }}>Last saved: {lastSaved}</Text> : null}
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: "600" }}>Auto-send AI email on save</Text>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>Sends email automatically if recruiter email is found</Text>
          </View>
          <Switch value={autoSend} onValueChange={toggleAutoSend} />
        </View>

        <Text style={{ color: "#6b7280", fontSize: 12 }}>
          After starting capture, open the LinkedIn app. A floating &quot;Save to JobTrackr&quot; pill appears near the top-left. Drag it anywhere. Tap it when a job post is visible on screen, then return to JobTrackr to review the saved job.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const btn = { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" };
const btnStop = { backgroundColor: "#dc2626", padding: 12, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
