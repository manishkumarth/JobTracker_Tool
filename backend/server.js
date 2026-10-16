import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import mailRoutes from "./routes/mailRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import followupRoutes from "./routes/followupRoutes.js";
import callRoutes from "./routes/callRoutes.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import cronRoutes from "./routes/cronRoutes.js";
import extensionRoutes from "./routes/extensionRoutes.js";

dotenv.config();
connectDB();

const app = express();
const allowedOrigins = [process.env.CLIENT_URL || "http://localhost:5173"];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith("chrome-extension://")) {
        return cb(null, true);
      }
      cb(null, false);
    },
  })
);
app.use(express.json({ limit: "2mb" }));

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
app.use("/api/admin", adminRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/ext", extensionRoutes);

app.get("/", (req, res) => res.send("Job Application CRM API running"));

// Centralized error handler (keeps stack traces out of responses)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Something went wrong" });
});

// Only listen when running locally (not on Vercel)
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
