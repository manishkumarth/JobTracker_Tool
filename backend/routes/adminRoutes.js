import express from "express";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import Application from "../models/Application.js";
import Company from "../models/Company.js";
import Contact from "../models/Contact.js";
import EmailLog from "../models/EmailLog.js";
import FollowUp from "../models/FollowUp.js";
import EmailTemplate from "../models/EmailTemplate.js";
import Interview from "../models/Interview.js";
import Call from "../models/Call.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

export const ADMIN_EMAIL = "manish12099@gmail.com";

// Only the designated admin account can access these routes
const adminGuard = async (req, res, next) => {
  const user = await User.findById(req.userId).select("email isAdmin");
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// GET /api/admin/users - list all users with basic stats
router.get("/users", adminGuard, async (req, res) => {
  try {
    const users = await User.find().select("-password -gmailAppPasswordEnc -aiProviders").sort({ createdAt: -1 });

    const profiles = await CandidateProfile.find().select("owner resumes");
    const appCounts = await Application.aggregate([
      { $group: { _id: "$owner", count: { $sum: 1 } } },
    ]);
    const appMap = Object.fromEntries(appCounts.map((a) => [String(a._id), a.count]));
    const profileMap = Object.fromEntries(
      profiles.map((p) => [String(p.owner), (p.resumes || []).length])
    );

    const result = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      gmailConnected: u.gmailConnected,
      gmailAddress: u.gmailAddress,
      isAdmin: u.isAdmin,
      isDisabled: u.isDisabled,
      disabledReason: u.disabledReason,
      features: u.features,
      applications: appMap[String(u._id)] || 0,
      resumes: profileMap[String(u._id)] || 0,
      createdAt: u.createdAt,
    }));

    res.json({ users: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/disable
router.patch("/users/:id/disable", adminGuard, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot disable the admin account" });
    }
    user.isDisabled = true;
    user.disabledReason = reason || "Account disabled by admin";
    await user.save();
    res.json({ user: { _id: user._id, isDisabled: true } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/enable
router.patch("/users/:id/enable", adminGuard, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isDisabled = false;
    user.disabledReason = "";
    await user.save();
    res.json({ user: { _id: user._id, isDisabled: false } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/users/:id - delete a user and all their data
router.delete("/users/:id", adminGuard, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot delete the admin account" });
    }
    const id = req.params.id;

    await CandidateProfile.deleteMany({ owner: id });
    await Application.deleteMany({ owner: id });
    await Company.deleteMany({ owner: id });
    await Contact.deleteMany({ owner: id });
    await EmailLog.deleteMany({ owner: id });
    await FollowUp.deleteMany({ owner: id });
    await EmailTemplate.deleteMany({ owner: id });
    await Interview.deleteMany({ owner: id });
    await Call.deleteMany({ owner: id });
    await User.findByIdAndDelete(id);

    res.json({ message: "User and all associated data deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Per-user feature switches ───

// PATCH /api/admin/users/:id/features - toggle a single feature on/off
router.patch("/users/:id/features", adminGuard, async (req, res) => {
  try {
    const { feature, value } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot change the admin account's features" });
    }
    if (user.features?.[feature] === undefined) {
      return res.status(400).json({ message: `Unknown feature: ${feature}` });
    }

    user.features[feature] = Boolean(value);
    // Turning a feature back on should clear the blanket disable
    if (value && user.isDisabled) {
      user.isDisabled = false;
      user.disabledReason = "";
    }
    await user.save();

    res.json({ user: { _id: user._id, isDisabled: user.isDisabled, features: user.features } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/disable-all-features - turn every feature off at once
router.patch("/users/:id/disable-all-features", adminGuard, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot disable the admin account" });
    }

    Object.keys(user.features).forEach((k) => { user.features[k] = false; });
    user.isDisabled = true;
    user.disabledReason = user.disabledReason || "All features disabled by admin";
    await user.save();

    res.json({ user: { _id: user._id, isDisabled: user.isDisabled, features: user.features } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/enable-all-features - turn every feature back on
router.patch("/users/:id/enable-all-features", adminGuard, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot change the admin account's features" });
    }

    Object.keys(user.features).forEach((k) => { user.features[k] = true; });
    await user.save();

    res.json({ user: { _id: user._id, isDisabled: user.isDisabled, features: user.features } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin-configurable Gmail setup video ───

// GET /api/admin/app-video - read the YouTube link (any authenticated user)
router.get("/app-video", async (req, res) => {
  try {
    const AppSetting = (await import("../models/AppSetting.js")).default;
    const url = await AppSetting.getValue("gmailVideoUrl");
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/app-video - set the YouTube link (admin only)
router.put("/app-video", adminGuard, async (req, res) => {
  try {
    const raw = typeof req.body.url === "string" ? req.body.url.trim() : "";
    let url = "";
    if (raw) {
      // Accept a full YouTube embed URL or a bare watch URL / video id
      const m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      if (m) url = `https://www.youtube.com/embed/${m[1]}`;
      else if (/^https?:\/\/.+/.test(raw)) url = raw;
      else return res.status(400).json({ message: "Not a valid YouTube URL" });
    }
    const AppSetting = (await import("../models/AppSetting.js")).default;
    await AppSetting.setValue("gmailVideoUrl", url);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
