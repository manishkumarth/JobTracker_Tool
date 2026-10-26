/** Simple event bus for feature-disabled / account-disabled (mirrors web CustomEvent). */
const listeners = new Set();

export function emitFeatureDisabled(detail) {
  const payload = detail || {};
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.warn("feature listener error", e);
    }
  });
}

export function onFeatureDisabled(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
