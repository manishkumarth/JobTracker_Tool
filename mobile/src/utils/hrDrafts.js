import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "jt_hr_reply_pending";
const LEGACY_KEY = "jt_hr_reply_draft";
const MAX_DRAFTS = 50;

export async function listHrDrafts() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addHrDraft(draft) {
  const drafts = await listHrDrafts();
  const requestText = (draft?.requestText || "").trim();
  const recipientEmail = (draft?.recipientEmail || "").trim();
  if (!requestText) return drafts;

  // Do not queue the exact same email twice.
  const duplicate = drafts.some(
    (d) =>
      (d.requestText || "").trim() === requestText &&
      (d.recipientEmail || "").trim().toLowerCase() === recipientEmail.toLowerCase()
  );
  if (duplicate) return drafts;

  const entry = {
    ...draft,
    id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    requestText,
    recipientEmail,
  };
  const next = [entry, ...drafts].slice(0, MAX_DRAFTS);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function removeHrDraft(id) {
  if (!id) return listHrDrafts();
  const drafts = await listHrDrafts();
  const next = drafts.filter((d) => d.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function getHrDraft(id) {
  if (!id) return null;
  const drafts = await listHrDrafts();
  return drafts.find((d) => d.id === id) || null;
}

/**
 * Older builds stored a single draft under `jt_hr_reply_draft`. Keep reading it
 * as a fallback so pending drafts are not lost after updating the app.
 */
export async function takeLegacyHrDraft() {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(LEGACY_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
