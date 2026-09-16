import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "../backend/config/db.js";
import authRoutes from "../backend/routes/authRoutes.js";
import contactRoutes from "../backend/routes/contactRoutes.js";
import mailRoutes from "../backend/routes/mailRoutes.js";
import companyRoutes from "../backend/routes/companyRoutes.js";
import applicationRoutes from "../backend/routes/applicationRoutes.js";
import emailRoutes from "../backend/routes/emailRoutes.js";
import templateRoutes from "../backend/routes/templateRoutes.js";
import followupRoutes from "../backend/routes/followupRoutes.js";
import callRoutes from "../backend/routes/callRoutes.js";
import interviewRoutes from "../backend/routes/interviewRoutes.js";
import profileRoutes from "../backend/routes/profileRoutes.js";
import aiRoutes from "../backend/routes/aiRoutes.js";
import dashboardRoutes from "../backend/routes/dashboardRoutes.js";
import trackingRoutes from "../backend/routes/trackingRoutes.js";
import calendarRoutes from "../backend/routes/calendarRoutes.js";
import resumeRoutes from "../backend/routes/resumeRoutes.js";
import settingsRoutes from "../backend/routes/settingsRoutes.js";
import whatsappRoutes from "../backend/routes/whatsappRoutes.js";

dotenv.config();

let isConnected = false;

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

// Connect to MongoDB (reuse connection across invocations)
app.use(async (req, res, next) => {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
  }
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/mail", mailRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/followups", followupRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.get("/", (req, res) => res.send("Job Application CRM API running"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Something went wrong" });
});

export default function handler(req, res) {
  return app(req, res);
}
