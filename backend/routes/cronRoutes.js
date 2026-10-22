import express from "express";
import User from "../models/User.js";
import { processDueAutoFollowUps } from "../utils/autoFollowUpRunner.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

const ADMIN_EMAIL = "manish12099@gmail.com";

// Core logic: send only follow-ups the user explicitly scheduled with auto-send.
export const runAutoFollowUps = async () => processDueAutoFollowUps();

// GET /api/cron/auto-followup - invoked by Vercel Cron (or manually)
router.get("/auto-followup", async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await runAutoFollowUps();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/cron/run-auto-followup - admin-triggered manual run
router.post("/run-auto-followup", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email");
    if (!user || user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const result = await runAutoFollowUps();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
