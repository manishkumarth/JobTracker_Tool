// Local Expo module: LinkedIn Overlay
// Exposes native Android functionality:
// - startCapture(): shows floating "Save to JobTrackr" button + activates accessibility scraping
// - stopCapture(): hides the floating button
// - events: "postScraped" (emits { text, url }) when the button is tapped with scraped text ready

import { requireNativeModule, EventEmitter } from "expo";

const LinkedInOverlayModule = requireNativeModule("LinkedInOverlay");

export const startCapture = () => LinkedInOverlayModule.startCapture();
export const stopCapture = () => LinkedInOverlayModule.stopCapture();
export const isCaptureActive = () => LinkedInOverlayModule.isCaptureActive();
export const hasOverlayPermission = () => LinkedInOverlayModule.hasOverlayPermission();
export const isAccessibilityEnabled = () => LinkedInOverlayModule.isAccessibilityEnabled();
export const openOverlaySettings = () => LinkedInOverlayModule.openOverlaySettings();
export const openAccessibilitySettings = () => LinkedInOverlayModule.openAccessibilitySettings();

const emitter = new EventEmitter(LinkedInOverlayModule);

export const addPostScrapedListener = (listener) =>
  emitter.addListener("postScraped", listener);

export const addStatusListener = (listener) =>
  emitter.addListener("captureStatus", listener);

export default LinkedInOverlayModule;
