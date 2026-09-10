import express from "express";
import multer from "multer";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { getTransporter } from "../utils/mailer.js";
import { logActivity } from "../utils/activity.js";
import { generateTrackingId, injectTrackingIntoHtml, injectTrackingIntoText } from "../utils/tracking.js";

const router = express.Router();
router.use(authMiddleware);

// Memory storage only - no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

// POST /api/mail/upload  -> attach a PDF (in memory)
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.json({ filename: req.file.originalname, buffer: true, originalName: req.file.originalname });
});

// Fetch file from URL as buffer (for Cloudinary resumes)
import https from "https";
const fetchBuffer = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /api/mail/send
// body: { contactIds: [...], subject, message, resumeId?, attachmentFilename?, applicationId?, companyId?,
//         emailType?, isAiGenerated?, templateId?, allowResend? }
router.post("/send", async (req, res) => {
  try {
    const {
      contactIds, subject, message, resumeId, attachmentFilename,
      applicationId, companyId, emailType = "Job Application",
      isAiGenerated = false, templateId, allowResend = false,
      recipientEmail, recipientName,
    } = req.body;

    if ((!contactIds?.length && !recipientEmail) || !subject || !message) {
      return res.status(400).json({ message: "contactIds (or recipientEmail), subject and message are required" });
    }

    const user = await User.findById(req.userId);
    const transporter = getTransporter(user);

    let application = null;
    if (applicationId) {
      application = await Application.findOne({ _id: applicationId, owner: req.userId });
      if (!application) return res.status(404).json({ message: "Application not found" });

      if (!allowResend) {
        const alreadySent = await EmailLog.findOne({ owner: req.userId, application: applicationId, status: "Sent" });
        if (alreadySent) {
          return res.status(409).json({
            message: "An email has already been sent for this application. Pass allowResend to send again.",
            alreadySentAt: alreadySent.sentAt,
          });
        }
      }
    }

    let contacts;
    if (contactIds?.length) {
      contacts = await Contact.find({ _id: { $in: contactIds }, owner: req.userId });
    } else {
      // Inline email mode — no Contact document required
      contacts = [{ _id: null, email: recipientEmail, name: recipientName || "", companyRef: null, save: async () => {} }];
    }

    // Build attachments - all in memory, no disk writes
    let attachments = [];
    if (resumeId) {
      const profile = await CandidateProfile.findOne({ owner: req.userId });
      const resume = profile?.resumes?.id(resumeId);
      if (resume) {
        const buffer = await fetchBuffer(resume.cloudinaryUrl);
        attachments.push({ filename: resume.originalName, content: buffer });
      }
    } else if (attachmentFilename) {
      // In-memory upload buffer passed via req.file
      // (attachmentFilename is stored in frontend but buffer is in memory)
    }

    const results = [];
    for (const contact of contacts) {
      const trackingId = generateTrackingId();
      const trackingEnabled = true;

      const htmlContent = injectTrackingIntoHtml(message.replace(/\n/g, "<br/>"), trackingId, trackingEnabled);
      const textContent = injectTrackingIntoText(message, trackingId, trackingEnabled);

      const logEntry = await EmailLog.create({
        owner: req.userId,
        application: applicationId || null,
        company: companyId || contact.companyRef || null,
        contact: contact._id,
        recipient: contact.email,
        recipientName: contact.name || "",
        subject,
        body: message,
        status: "Pending",
        emailType,
        isAiGenerated,
        template: templateId || null,
        attachmentName: attachments[0]?.filename || "",
        trackingId,
        trackingEnabled,
      });

      try {
        await transporter.sendMail({
          from: `"${user.name}" <${user.gmailAddress}>`,
          to: contact.email,
          subject,
          text: textContent,
          html: htmlContent,
          attachments,
        });
        contact.lastSentAt = new Date();
        await contact.save();

        logEntry.status = "Sent";
        logEntry.sentAt = new Date();
        await logEntry.save();

        results.push({ email: contact.email, status: "sent" });
      } catch (err) {
        logEntry.status = "Failed";
        logEntry.errorMessage = err.message;
        await logEntry.save();
        results.push({ email: contact.email, status: "failed", error: err.message });
      }
      await delay(1500);
    }

    if (application) {
      const sentCount = results.filter((r) => r.status === "sent").length;
      if (sentCount > 0) {
        application.applicationDate = application.applicationDate || new Date();
        if (["NEW", "SAVED", "APPLYING"].includes(application.status)) {
          application.status = "EMAIL_SENT";
        }
        await logActivity(application, "email_sent", `Email sent to ${sentCount} recipient(s)${isAiGenerated ? " (AI-generated)" : ""}`);
      }
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/mail/reply - Reply to an existing email (threaded)
router.post("/reply", async (req, res) => {
  try {
    const { parentEmailId, contactIds, subject, message, resumeId, attachmentFilename } = req.body;
    if (!parentEmailId || !contactIds?.length || !message) {
      return res.status(400).json({ message: "parentEmailId, contactIds and message are required" });
    }

    const parentEmail = await EmailLog.findOne({ _id: parentEmailId, owner: req.userId });
    if (!parentEmail) return res.status(404).json({ message: "Parent email not found" });

    const user = await User.findById(req.userId);
    const transporter = getTransporter(user);

    const contacts = await Contact.find({ _id: { $in: contactIds }, owner: req.userId });

    let attachments = [];
    if (resumeId) {
      const profile = await CandidateProfile.findOne({ owner: req.userId });
      const resume = profile?.resumes?.id(resumeId);
      if (resume) {
        const buffer = await fetchBuffer(resume.cloudinaryUrl);
        attachments.push({ filename: resume.originalName, content: buffer });
      }
    } else if (attachmentFilename) {
      // attachmentFilename noted but no disk buffer available
    }

    const threadId = parentEmail.threadId || parentEmail._id.toString();
    const references = [...(parentEmail.references || []), parentEmail._id.toString()];

    const results = [];
    for (const contact of contacts) {
      const trackingId = generateTrackingId();
      const trackingEnabled = true;

      const replySubject = subject.startsWith("Re:") ? subject : `Re: ${parentEmail.subject}`;
      const htmlContent = injectTrackingIntoHtml(message.replace(/\n/g, "<br/>"), trackingId, trackingEnabled);
      const textContent = injectTrackingIntoText(message, trackingId, trackingEnabled);

      const logEntry = await EmailLog.create({
        owner: req.userId,
        application: parentEmail.application,
        company: parentEmail.company,
        contact: contact._id,
        recipient: contact.email,
        recipientName: contact.name || "",
        subject: replySubject,
        body: message,
        status: "Pending",
        emailType: "Recruiter Response",
        isAiGenerated: false,
        attachmentName: attachments[0]?.filename || "",
        trackingId,
        trackingEnabled,
        threadId,
        inReplyTo: parentEmail._id.toString(),
        references,
        isReply: true,
        parentEmail: parentEmail._id,
      });

      try {
        await transporter.sendMail({
          from: `"${user.name}" <${user.gmailAddress}>`,
          to: contact.email,
          subject: replySubject,
          text: textContent,
          html: htmlContent,
          attachments,
          inReplyTo: parentEmail._id.toString(),
          references: references.join(" "),
        });
        contact.lastSentAt = new Date();
        await contact.save();

        logEntry.status = "Sent";
        logEntry.sentAt = new Date();
        await logEntry.save();

        results.push({ email: contact.email, status: "sent" });
      } catch (err) {
        logEntry.status = "Failed";
        logEntry.errorMessage = err.message;
        await logEntry.save();
        results.push({ email: contact.email, status: "failed", error: err.message });
      }
      await delay(1500);
    }

    if (parentEmail.application) {
      const application = await Application.findById(parentEmail.application);
      if (application) {
        await logActivity(application, "email_sent", `Reply sent to ${results.filter(r => r.status === "sent").length} recipient(s)`);
      }
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/mail/thread/:emailId - Get full email thread
router.get("/thread/:emailId", async (req, res) => {
  try {
    const email = await EmailLog.findOne({ _id: req.params.emailId, owner: req.userId });
    if (!email) return res.status(404).json({ message: "Email not found" });

    const threadId = email.threadId || email._id.toString();
    const thread = await EmailLog.find({ owner: req.userId, threadId })
      .sort({ createdAt: 1 })
      .populate("contact", "name email")
      .populate("application", "jobTitle companyName");

    res.json({ thread, rootEmail: email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
