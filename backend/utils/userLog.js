import UserLog from "../models/UserLog.js";

const clientIp = (req) =>
  (req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req?.socket?.remoteAddress || "";

// Fire-and-forget audit logging — never let a logging failure break a request.
// `user` is a User document (or { _id, name, email }); `req` is optional, used
// for the IP / user-agent snapshot.
export const logUserEvent = async (user, type, action = "", meta = {}, req = null) => {
  try {
    if (!user) return;
    await UserLog.create({
      user: user._id,
      name: user.name || "",
      email: user.email || "",
      type,
      action,
      meta,
      ip: clientIp(req),
      userAgent: req?.headers?.["user-agent"] || "",
    });
  } catch (err) {
    console.error("userLog error:", err.message);
  }
};
