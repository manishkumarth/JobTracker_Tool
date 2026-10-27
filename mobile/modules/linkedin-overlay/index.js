// Local Expo module: LinkedIn Overlay
// Works only in a real Android build (EAS APK / expo run:android). Expo Go has no native module.

import { Platform } from "react-native";

let Native = null;
let emitter = null;

function loadNative() {
  if (Native || Platform.OS !== "android") return Native;
  try {
    // Lazy require so Expo Go does not crash the whole app at import time
    const { requireNativeModule, EventEmitter } = require("expo");
    Native = requireNativeModule("LinkedInOverlay");
    emitter = new EventEmitter(Native);
  } catch (e) {
    Native = null;
    emitter = null;
  }
  return Native;
}

export const isModuleAvailable = () => {
  try {
    return !!loadNative();
  } catch {
    return false;
  }
};

export const startCapture = () => {
  const n = loadNative();
  if (!n) throw new Error("Native overlay module not loaded");
  return n.startCapture();
};

export const stopCapture = () => {
  const n = loadNative();
  if (!n) throw new Error("Native overlay module not loaded");
  return n.stopCapture();
};

export const isCaptureActive = () => {
  const n = loadNative();
  if (!n) return false;
  return n.isCaptureActive();
};

export const hasOverlayPermission = () => {
  const n = loadNative();
  if (!n) return false;
  return n.hasOverlayPermission();
};

export const isAccessibilityEnabled = () => {
  const n = loadNative();
  if (!n) return false;
  return n.isAccessibilityEnabled();
};

export const setOverlayStatus = (text, color) => {
  const n = loadNative();
  if (!n) return;
  return n.setOverlayStatus(text, color);
};

export const openOverlaySettings = () => {
  const n = loadNative();
  if (!n) throw new Error("Native overlay module not loaded");
  return n.openOverlaySettings();
};

export const openAccessibilitySettings = () => {
  const n = loadNative();
  if (!n) throw new Error("Native overlay module not loaded");
  return n.openAccessibilitySettings();
};

export const addPostScrapedListener = (listener) => {
  loadNative();
  if (!emitter) return { remove() {} };
  return emitter.addListener("postScraped", listener);
};

export const addStatusListener = (listener) => {
  loadNative();
  if (!emitter) return { remove() {} };
  return emitter.addListener("captureStatus", listener);
};

const LinkedInOverlay = {
  isModuleAvailable,
  startCapture,
  stopCapture,
  isCaptureActive,
  hasOverlayPermission,
  isAccessibilityEnabled,
  setOverlayStatus,
  openOverlaySettings,
  openAccessibilitySettings,
  addPostScrapedListener,
  addStatusListener,
};

export default LinkedInOverlay;
