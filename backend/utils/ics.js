import crypto from "crypto";

export const generateICS = (events, calendarName = "Job Application Calendar") => {
  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const escapeText = (text) => {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const formatDateLocal = (date) => {
    const d = new Date(date);
    return d.toISOString().replace(/[-:]/g, "").split(".")[0];
  };

  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Job Application CRM//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    const uid = `${event.id || crypto.randomUUID()}@jobapp-crm`;
    const dtstart = event.allDay ? formatDateLocal(event.start) : formatDate(event.start);
    const dtend = event.allDay
      ? formatDateLocal(new Date(new Date(event.start).getTime() + 24 * 60 * 60 * 1000))
      : formatDate(event.end || new Date(new Date(event.start).getTime() + 60 * 60 * 1000));

    ics.push("BEGIN:VEVENT");
    ics.push(`UID:${uid}`);
    ics.push(`DTSTAMP:${dtstamp}`);
    ics.push(`DTSTART:${event.allDay ? dtstart : dtstart}`);
    ics.push(`DTEND:${event.allDay ? dtend : dtend}`);
    ics.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) {
      ics.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      ics.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.url) {
      ics.push(`URL:${event.url}`);
    }
    ics.push("END:VEVENT");
  }

  ics.push("END:VCALENDAR");
  return ics.join("\r\n");
};

export const buildInterviewEvents = (interviews) => {
  return interviews.map((interview) => ({
    id: interview._id?.toString() || interview.id,
    title: `Interview: ${interview.application?.jobTitle || "Job Application"} - ${interview.round}`,
    description: [
      `Company: ${interview.application?.companyName || "N/A"}`,
      `Type: ${interview.interviewType}`,
      `Round: ${interview.round}`,
      interview.meetingLink ? `Meeting Link: ${interview.meetingLink}` : "",
      interview.location ? `Location: ${interview.location}` : "",
      interview.notes ? `Notes: ${interview.notes}` : "",
    ].filter(Boolean).join("\n"),
    start: new Date(interview.date),
    end: new Date(new Date(interview.date).getTime() + (interview.duration || 60) * 60 * 1000),
    location: interview.location || "",
    url: interview.meetingLink || "",
    allDay: false,
  }));
};

export const buildFollowUpEvents = (followUps) => {
  return followUps.map((fu) => ({
    id: fu._id?.toString() || fu.id,
    title: `Follow-up: ${fu.application?.jobTitle || "Application"} (${fu.type})`,
    description: [
      `Company: ${fu.application?.companyName || "N/A"}`,
      `Type: ${fu.type}`,
      fu.note ? `Note: ${fu.note}` : "",
    ].filter(Boolean).join("\n"),
    start: new Date(fu.date),
    end: new Date(new Date(fu.date).getTime() + 30 * 60 * 1000),
    allDay: false,
  }));
};