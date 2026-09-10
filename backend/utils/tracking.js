import crypto from "crypto";

export const generateTrackingId = () => crypto.randomBytes(16).toString("hex");

export const buildTrackingPixelUrl = (trackingId, baseUrl = process.env.TRACKING_BASE_URL || "http://localhost:5000") => {
  return `${baseUrl}/api/tracking/open/${trackingId}.png`;
};

export const buildTrackedLinkUrl = (trackingId, originalUrl, baseUrl = process.env.TRACKING_BASE_URL || "http://localhost:5000") => {
  const encodedUrl = encodeURIComponent(originalUrl);
  return `${baseUrl}/api/tracking/click/${trackingId}?url=${encodedUrl}`;
};

export const injectTrackingIntoHtml = (html, trackingId, trackingEnabled = true) => {
  if (!trackingEnabled) return html;

  const pixelUrl = buildTrackingPixelUrl(trackingId);
  const pixel = `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none;" />`;

  let trackedHtml = html;

  trackedHtml = trackedHtml.replace(
    /<a\s+([^>]*href\s*=\s*["']([^"']+)["'][^>]*)>/gi,
    (match, attrs, url) => {
      if (url.startsWith("mailto:") || url.startsWith("tel:")) return match;
      const trackedUrl = buildTrackedLinkUrl(trackingId, url);
      return match.replace(url, trackedUrl);
    }
  );

  if (!trackedHtml.includes(pixelUrl)) {
    trackedHtml = trackedHtml.replace("</body>", `${pixel}</body>`);
    if (!trackedHtml.includes("</body>")) {
      trackedHtml += pixel;
    }
  }

  return trackedHtml;
};

export const injectTrackingIntoText = (text, trackingId, trackingEnabled = true) => {
  if (!trackingEnabled) return text;

  return text.replace(
    /(https?:\/\/[^\s]+)/g,
    (match) => buildTrackedLinkUrl(trackingId, match)
  );
};