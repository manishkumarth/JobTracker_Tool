import UserLog from "../models/UserLog.js";

const clientIp = (req) =>
  (req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req?.socket?.remoteAddress || "";

const isLocalIp = (ip) => !ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.16.");

const locationCache = new Map();

async function resolveLocation(ip) {
  if (!ip) return null;
  if (isLocalIp(ip)) return { city: "Local", region: "", country: "Local", lat: null, lon: null, timezone: "" };
  if (locationCache.has(ip)) return locationCache.get(ip);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,latitude,longitude,timezone.id`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`lookup failed ${res.status}`);
    const data = await res.json();
    if (!data?.success) {
      locationCache.set(ip, null);
      return null;
    }
    const loc = {
      city: data.city || "",
      region: data.region || "",
      country: data.country || "",
      lat: typeof data.latitude === "number" ? data.latitude : null,
      lon: typeof data.longitude === "number" ? data.longitude : null,
      timezone: data?.timezone?.id || "",
    };
    locationCache.set(ip, loc);
    return loc;
  } catch {
    locationCache.set(ip, null);
    return null;
  }
}

// Fire-and-forget audit logging — never let a logging failure break a request.
// `user` is a User document (or { _id, name, email }); `req` is optional, used
// for the IP / user-agent snapshot. Location is resolved from the IP with a short
// timeout and cached per process.
export const logUserEvent = async (user, type, action = "", meta = {}, req = null) => {
  try {
    if (!user) return;
    const ip = clientIp(req);
    const location = await resolveLocation(ip);
    await UserLog.create({
      user: user._id,
      name: user.name || "",
      email: user.email || "",
      type,
      action,
      meta,
      ip,
      location: location || undefined,
      userAgent: req?.headers?.["user-agent"] || "",
    });
  } catch (err) {
    console.error("userLog error:", err.message);
  }
};

export default logUserEvent;