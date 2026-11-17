import { createScheduledEmail } from "./scheduledEmailService.js";
import { planScheduledAccounts } from "../utils/emailAccounts.js";
import { nextWeekdaySlot } from "../utils/scheduling.js";

/**
 * Schedule the SAME email content from every other usable Gmail account, each
 * at its own preferred time/timezone.
 *
 * This is used for both application emails and follow-ups:
 *  - the content (subject/body) is reused verbatim — no AI/LLM call is made;
 *  - accounts that are disabled, have no App Password or are set to "Send Now"
 *    are returned in `skipped` with a reason instead of being scheduled;
 *  - application emails skip the whole weekend, follow-ups only skip Sunday.
 */
export async function scheduleForOtherAccounts({
  user,
  application,
  recipient = {},
  draft = {},
  resumeId = null,
  senderAccountId = null,
  allowResend = false,
  emailType = "Job Application",
  skipDays,
  now = new Date(),
} = {}) {
  const isFollowUp = emailType === "Follow-up";
  const blockedDays = skipDays || (isFollowUp ? [0] : [0, 6]);

  const { schedule, skipped } = planScheduledAccounts(user, senderAccountId);
  const scheduled = [];
  const errors = [];

  for (const { account: acc, prefs } of schedule) {
    const scheduledAt = nextWeekdaySlot({
      time: prefs.scheduleTime,
      timeZone: prefs.scheduleTimezone,
      skipDays: blockedDays,
      now,
    });

    try {
      const job = await createScheduledEmail({
        user,
        input: {
          applicationId: application?._id,
          contactId: recipient.contactId || null,
          recipientEmail: recipient.recipientEmail,
          recipientName: recipient.recipientName || "",
          subject: draft.subject,
          body: draft.body,
          resumeId,
          accountId: String(acc._id),
          scheduledAt: scheduledAt.toISOString(),
          timezone: prefs.scheduleTimezone,
          emailType,
          isAiGenerated: !!draft.generated,
          allowResend,
        },
      });
      scheduled.push({
        _id: String(job._id),
        accountId: String(acc._id),
        accountEmail: acc.address,
        scheduledAt: job.scheduledAt,
        timezone: job.timezone,
        emailType: job.emailType,
      });
    } catch (e) {
      if (e.code === "DUPLICATE_SCHEDULE") {
        // The other account already has an active copy for this email — not a
        // failure, just nothing new to queue.
        skipped.push({ accountEmail: acc.address, reason: "A copy is already scheduled" });
        continue;
      }
      console.error(`[schedule] ${emailType} from ${acc.address} failed:`, e.message);
      errors.push({ accountEmail: acc.address, message: e.message, code: e.code || null });
    }
  }

  return { scheduled, skipped, errors };
}

export default scheduleForOtherAccounts;
