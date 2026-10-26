// Local Expo module: LinkedIn Overlay
// Only works inside a native Android build (EAS / expo run:android), not Expo Go.

import { requireNativeModule, EventEmitter } from "expo";

const Native = requireNativeModule("LinkedInOverlay");
const emitter = new EventEmitter(Native);

export const startCapture = () => Native.startCapture();
export const stopCapture = () => Native.stopCapture();
export const isCaptureActive = () => Native.isCaptureActive();
export const hasOverlayPermission = () => Native.hasOverlayPermission();
export const isAccessibilityEnabled = () => Native.isAccessibilityEnabled();
export const setOverlayStatus = (text, color) => Native.setOverlayStatus(text, color);
export const openOverlaySettings = () => Native.openOverlaySettings();
export const openAccessibilitySettings = () => Native.openAccessibilitySettings();

export const addPostScrapedListener = (listener) =>
  emitter.addListener("postScraped", listener);

export const addStatusListener = (listener) =>
  emitter.addListener("captureStatus", listener);

/** Unified API object for require("linkedin-overlay") consumers */
const LinkedInOverlay = {
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
