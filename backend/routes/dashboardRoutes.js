import express from "express";
import Application from "../models/Application.js";
import Company from "../models/Company.js";
import Contact from "../models/Contact.js";
import EmailLog from "../models/EmailLog.js";
import FollowUp from "../models/FollowUp.js";
import Interview from "../models/Interview.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/stats", async (req, res) => {
  try {
    const owner = req.userId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [
      totalApplications, totalCompanies, totalContacts,
      emailsSent, emailsFailed, emailsPending,
      applicationsToday, applicationsThisWeek,
      followUpsToday, overdueFollowUps, upcomingFollowUps,
      interviewsScheduled, offers, rejected, noResponse,
      recentApplications, recentEmails,
      upcomingInterviews, recentFollowUpsDue, overdueFollowUpsList,
    ] = await Promise.all([
      Application.countDocuments({ owner }),
      Company.countDocuments({ owner }),
      Contact.countDocuments({ owner }),
      EmailLog.countDocuments({ owner, status: "Sent" }),
      EmailLog.countDocuments({ owner, status: "Failed" }),
      EmailLog.countDocuments({ owner, status: "Pending" }),
      Application.countDocuments({ owner, createdAt: { $gte: startOfToday, $lte: endOfToday } }),
      Application.countDocuments({ owner, createdAt: { $gte: startOfWeek } }),
      FollowUp.countDocuments({ owner, status: "Pending", date: { $gte: startOfToday, $lte: endOfToday } }),
      FollowUp.countDocuments({ owner, status: "Pending", date: { $lt: startOfToday } }),
      FollowUp.countDocuments({ owner, status: "Pending", date: { $gt: endOfToday } }),
      Application.countDocuments({ owner, status: "INTERVIEW_SCHEDULED" }),
      Application.countDocuments({ owner, status: { $in: ["OFFER", "SELECTED"] } }),
      Application.countDocuments({ owner, status: "REJECTED" }),
      Application.countDocuments({ owner, status: "NO_RESPONSE" }),
      Application.find({ owner }).populate("company", "name").sort({ createdAt: -1 }).limit(5),
      EmailLog.find({ owner }).sort({ createdAt: -1 }).limit(5),
      Interview.find({ owner, date: { $gte: now }, result: { $in: ["Scheduled", "Rescheduled"] } })
        .populate({ path: "application", select: "jobTitle" }).sort({ date: 1 }).limit(5),
      FollowUp.find({ owner, status: "Pending", date: { $gte: startOfToday, $lte: endOfToday } })
        .populate({ path: "application", select: "jobTitle companyName" }).limit(5),
      FollowUp.find({ owner, status: "Pending", date: { $lt: startOfToday } })
        .populate({ path: "application", select: "jobTitle companyName" }).sort({ date: 1 }).limit(5),
    ]);

    // Recent activity feed, built from the most recent applications' own timelines
    const timelineSource = await Application.find({ owner }).sort({ updatedAt: -1 }).limit(10)
      .select("companyName jobTitle activity");
    const recentActivity = timelineSource
      .flatMap((app) =>
        app.activity.slice(-2).map((a) => ({
          message: `${a.message} \u2014 ${app.companyName || app.jobTitle}`,
          type: a.type,
          at: a.at,
        }))
      )
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 10);

    res.json({
      stats: {
        totalApplications, totalCompanies, totalContacts,
        emailsSent, emailsFailed, emailsPending,
        applicationsToday, applicationsThisWeek,
        followUpsToday, overdueFollowUps, upcomingFollowUps,
        interviewsScheduled, offers, rejected, noResponse,
      },
      recentApplications,
      recentEmails,
      upcomingInterviews,
      followUpsDueToday: recentFollowUpsDue,
      overdueFollowUpsList,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
