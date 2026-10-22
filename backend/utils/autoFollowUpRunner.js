import User from "../models/User.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import CandidateProfile from "../models/CandidateProfile.js";
import FollowUp from "../models/FollowUp.js";
import { sendFollowUpEmail } from "./followUpSender.js";

export const processDueAutoFollowUps = async ({ owner } = {}) => {
  const query = {
    status: "Pending",
    autoSend: true,
    emailSentAt: null,
    date: { $lte: new Date() },
  };
  if (owner) query.owner = owner;

  const due = await FollowUp.find(query).sort({ date: 1 }).limit(50);

  let sent = 0;
  let skipped = 0;

  for (const followUp of due) {
    try {
      const user = await User.findById(followUp.owner);
      if (!user || !user.gmailConnected || user.isDisabled) {
        skipped++;
        continue;
      }

      const application = await Application.findOne({ _id: followUp.application, owner: followUp.owner });
      if (!application) {
        skipped++;
        continue;
      }

      const contact = application.contact ? await Contact.findById(application.contact) : null;
      const profile = await CandidateProfile.findOne({ owner: followUp.owner });

      const result = await sendFollowUpEmail({ user, application, contact, profile, followUp });
      if (result.sent) sent++;
      else skipped++;
    } catch (err) {
      console.error("Auto follow-up failed for follow-up", followUp._id, err.message);
      skipped++;
    }
  }

  return { processed: due.length, sent, skipped, ranAt: new Date().toISOString() };
};
