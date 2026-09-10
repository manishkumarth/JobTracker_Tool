import express from "express";
import EmailLog from "../models/EmailLog.js";

const router = express.Router();

const getClientIp = (req) => {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
};

router.get("/open/:trackingId.png", async (req, res) => {
  try {
    const { trackingId } = req.params;
    const emailLog = await EmailLog.findOne({ trackingId });

    if (emailLog && emailLog.trackingEnabled) {
      const event = {
        type: "open",
        timestamp: new Date(),
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"],
      };
      emailLog.opens.push(event);
      emailLog.openCount += 1;
      emailLog.lastOpenedAt = new Date();
      await emailLog.save();
    }

    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    const transparentPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    res.send(transparentPixel);
  } catch {
    res.status(204).send();
  }
});

router.get("/click/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { url } = req.query;

    const emailLog = await EmailLog.findOne({ trackingId });

    if (emailLog && emailLog.trackingEnabled && url) {
      const event = {
        type: "click",
        timestamp: new Date(),
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"],
        linkUrl: url,
      };
      emailLog.clicks.push(event);
      emailLog.clickCount += 1;
      emailLog.lastClickedAt = new Date();
      await emailLog.save();

      return res.redirect(url);
    }

    return res.redirect(url || "/");
  } catch {
    return res.redirect("/");
  }
});

router.get("/stats/:emailLogId", async (req, res) => {
  try {
    const emailLog = await EmailLog.findOne({
      _id: req.params.emailLogId,
      owner: req.userId,
    }).select("opens clicks openCount clickCount lastOpenedAt lastClickedAt");

    if (!emailLog) return res.status(404).json({ message: "Not found" });

    res.json({
      opens: emailLog.opens,
      clicks: emailLog.clicks,
      openCount: emailLog.openCount,
      clickCount: emailLog.clickCount,
      lastOpenedAt: emailLog.lastOpenedAt,
      lastClickedAt: emailLog.lastClickedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;