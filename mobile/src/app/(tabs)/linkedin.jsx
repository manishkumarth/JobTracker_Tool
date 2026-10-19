import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Platform } from "react-native";
import { useEffect, useState, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking } from "react-native";
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
  const [status, setStatus] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const listenersRef = useRef([]);

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
      const sub2 = LinkedInOverlay.addStatusListener?.(({ status: s, accessibilityEnabled }) => {
        if (s === "started") {
          setCaptureActive(true);
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
        }
      });
      listenersRef.current = [sub1, sub2].filter(Boolean);
    }

    return () => {
      listenersRef.current.forEach((l) => l?.remove?.());
      listenersRef.current = [];
    };
  }, []);

  const onStart = async () => {
    if (!LinkedInOverlay) {
      Alert.alert("Not available", "The LinkedIn capture module requires a development build (not Expo Go). Run 'npx expo run:android' or build with EAS.");
      return;
    }
    try {
      await LinkedInOverlay.startCapture();
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
      if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION,
          { data: "package:com.jobtrackr.app" }
        );
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const openAccessibilitySettings = async () => {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.ACCESSIBILITY_SETTINGS);
    } catch (e) {
      try {
        await Linking.openSettings();
      } catch {
        Alert.alert("Error", "Could not open settings");
      }
    }
  };

  const toggleAutoSend = async (val) => {
    setAutoSend(val);
    await AsyncStorage.setItem("autoSend", val ? "true" : "false");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>LinkedIn Capture</Text>
        <Text style={{ color: "#6b7280" }}>
          Shows a floating "Save to JobTrackr" button on top of the LinkedIn Android app — like the Chrome extension. Tap it to capture the visible job post and save it to your tracker.
        </Text>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>1. Overlay Permission</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Lets the floating button appear over other apps.</Text>
          <TouchableOpacity onPress={openOverlaySettings} style={btn}>
            <Text style={btnText}>Grant Overlay Permission</Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>2. Accessibility Service</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Enable "JobTrackr LinkedIn Capture" under Accessibility. It reads the visible post text when you tap the button.
          </Text>
          <TouchableOpacity onPress={openAccessibilitySettings} style={btn}>
            <Text style={btnText}>Open Accessibility Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>3. Start / Stop Capture</Text>
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
          After starting capture, open the LinkedIn app. A floating "Save to JobTrackr" button will appear. Tap it when a job post is visible on screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const btn = { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" };
const btnStop = { backgroundColor: "#dc2626", padding: 12, borderRadius: 8, alignItems: "center" };
const btnText = { color: "#fff", fontWeight: "600" };
