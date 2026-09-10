import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";
import { encrypt } from "../utils/crypto.js";

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Account already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: hashed });

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, gmailConnected: user.gmailConnected },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, gmailConnected: user.gmailConnected, gmailAddress: user.gmailAddress },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select("-password -gmailAppPasswordEnc");
  res.json(user);
});

// POST /api/auth/connect-gmail  (store the user's OWN gmail + app password)
router.post("/connect-gmail", authMiddleware, async (req, res) => {
  try {
    const { gmailAddress, appPassword } = req.body;
    if (!gmailAddress || !appPassword) {
      return res.status(400).json({ message: "Gmail address and app password are required" });
    }
    const user = await User.findById(req.userId);
    user.gmailAddress = gmailAddress.toLowerCase();
    user.gmailAppPasswordEnc = encrypt(appPassword);
    user.gmailConnected = true;
    await user.save();
    res.json({ message: "Gmail connected", gmailAddress: user.gmailAddress });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/disconnect-gmail
router.post("/disconnect-gmail", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.gmailAddress = "";
    user.gmailAppPasswordEnc = "";
    user.gmailConnected = false;
    await user.save();
    res.json({ message: "Gmail disconnected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
