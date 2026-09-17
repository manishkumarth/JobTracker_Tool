import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { rewriteWhatsAppMessage, logWhatsAppMessage } from "../api/whatsapp.js";
import { listResumes, uploadResume } from "../api/resumes.js";
import { getProfile } from "../api/profile.js";

const TEMPLATES = [
  { name: "Job Inquiry", message: "Hi {name}, I hope you're doing well. I'm {myName}, a {title} with {experience} of experience in {skills}. I wanted to check if there are any open positions at {company} that match my profile. I'd love to be considered. Happy to share my resume!" },
  { name: "Job Apply", message: "Hi {name}, I'm {myName}, a {title} with {experience} experience in {skills}. I'm very interested in the {role} position at {company} and would like to apply. I've attached my resume for your review. Looking forward to hearing from you!" },
  { name: "Referral Request", message: "Hi {name}, I hope you're well. I'm {myName}, a {title} with {experience} of experience. I'm very interested in the {role} position at {company} and saw that you work there. Would you be open to referring me? Happy to share my resume. Thank you!" },
  { name: "Follow-up", message: "Hi {name}, I hope you're doing well. I wanted to follow up on our recent conversation about the {role} position. Please let me know if there are any updates. Thank you!" },
  { name: "Thank You", message: "Hi {name}, thank you for taking the time to speak with me today. I really enjoyed learning more about the role and the team. Looking forward to hearing from you!" },
  { name: "Introduction", message: "Hi {name}, I'm {myName}, a {title} with experience in {skills}. I came across the {role} opening at {company} and wanted to reach out. Would love to connect!" },
  { name: "Quick Check-in", message: "Hi {name}, just checking in! Hope things are going well. Let me know if there's anything I can help with." },
  { name: "Post-Interview Thank You", message: "Hi {name}, thank you for the interview today for the {role} position. I really enjoyed our conversation and I'm even more excited about the opportunity. Looking forward to the next steps!" },
  { name: "Offer Negotiation", message: "Hi {name}, thank you for the offer for the {role} position! I'm very excited about the opportunity. I'd love to discuss the compensation package — would you have time this week to connect?" },
  { name: "Availability Confirmation", message: "Hi {name}, just confirming — I'm available to start from {date}. Please let me know if you need any additional information from my end. Looking forward to it!" },
  { name: "Profile Sharing", message: "Hi {name}, as discussed, here's my profile for the {role} position at {company}. I have {experience} of experience in {skills}. Happy to provide any additional details. Thank you!" },
  { name: "Reconnect", message: "Hi {name}, it's been a while! I hope you're doing great. I'm currently exploring new opportunities and wanted to reconnect. Would love to catch up if you have a few minutes." },
  { name: "Salary Discussion", message: "Hi {name}, I wanted to discuss the compensation for the {role} role. Based on my experience in {skills} and market research, I was hoping we could discuss a figure closer to {salary}. Open to a conversation whenever convenient." },
  { name: "Job Status Update", message: "Hi {name}, I wanted to check on the status of my application for the {role} position at {company}. Very interested in the role and happy to provide any further information needed. Thank you!" },
  { name: "Referral Thank You", message: "Hi {name}, I wanted to thank you for referring me for the {role} position at {company}. I really appreciate your support. I'll keep you updated on how it goes!" },
  { name: "Networking", message: "Hi {name}, I came across your profile and was impressed by your work at {company}. I'm a {title} with {experience} experience and would love to connect and learn from your experience. Would you be open to a quick chat?" },
  { name: "Cold Outreach", message: "Hi {name}, I hope this message finds you well. I'm {myName}, a {title} with {experience} experience in {skills}. I'm very interested in the work {company} is doing. Would you be open to discussing potential opportunities on the team?" },
  { name: "Portfolio Sharing", message: "Hi {name}, I'm {myName}, a {title} with {experience} experience. Here are some of my recent projects: {projects}. I'd love to discuss how I can contribute to {company}. Happy to share more details!" },
];

const replaceVars = (text, vars) => {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result.replace(/\s{2,}/g, " ").trim();
};

export default function WhatsAppMessageComposer({ contact, onClose, onSent }) {
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [rewriting, setRewriting] = useState(false);
  const [sending, setSending] = useState(false);
  const [tone, setTone] = useState("professional");

  const [resumes, setResumes] = useState([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [selectedResume, setSelectedResume] = useState(null);
  const [driveLinks, setDriveLinks] = useState([""]);
  const [attachType, setAttachType] = useState("none");
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    Promise.all([
      listResumes().catch(() => ({ resumes: [] })),
      getProfile().catch(() => null),
    ]).then(([resumeData, profileData]) => {
      setResumes(resumeData.resumes || []);
      setResumesLoading(false);
      setProfile(profileData);
    });
  }, []);

  const getVars = () => ({
    name: contact.name || "",
    myName: profile?.name || "",
    title: profile?.professionalTitle || "",
    experience: profile?.experience || "",
    skills: (profile?.skills || []).join(", ") || "",
    company: contact.company || "",
    role: contact.designation || "",
    projects: (profile?.projects || []).join(", ") || "",
    technologies: (profile?.technologies || []).join(", ") || "",
    education: profile?.education || "",
    salary: "",
    date: "",
    topic: "",
  });

  const fillTemplate = (tpl) => {
    setSelectedTemplate(tpl.name);
    const resolved = replaceVars(tpl.message, getVars());
    setMessage(resolved);
  };

  const handleRewrite = async () => {
    if (!message.trim()) return toast.error("Enter a message first");
    setRewriting(true);
    try {
      const { rewritten } = await rewriteWhatsAppMessage({ message, tone, contactName: contact.name });
      setMessage(rewritten);
      toast.success("Message rewritten!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to rewrite");
    } finally {
      setRewriting(false);
    }
  };

  const handleUploadResume = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    setUploading(true);
    try {
      const { resume } = await uploadResume(file);
      setResumes((prev) => [...prev, resume]);
      setSelectedResume(resume);
      setAttachType("resume");
      toast.success("Resume uploaded");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const getAttachLinks = () => {
    const links = [];
    if (attachType === "resume" && selectedResume) {
      let url = selectedResume.cloudinaryUrl;
      if (url && !url.endsWith(".pdf")) {
        url = url.replace(/\/upload\//, "/upload/").replace(/\?.*$/, "");
        if (!url.endsWith(".pdf")) url += ".pdf";
      }
      links.push(url);
    }
    if (attachType === "drive") {
      driveLinks.forEach((link) => {
        if (link.trim()) links.push(link.trim());
      });
    }
    return links;
  };

  const buildFinalMessage = () => {
    const links = getAttachLinks();
    if (links.length > 0) {
      const linkText = links.map((l) => `• ${l}`).join("\n");
      return `${message}\n\nResume:\n${linkText}`;
    }
    return message;
  };

  const getPhone = () => {
    const raw = contact.phone || "";
    return raw.replace(/[^0-9+]/g, "");
  };

  const getWaLink = (text) => {
    let phone = getPhone();
    if (!phone) return null;
    if (phone.startsWith("+")) phone = phone.slice(1);
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };

  const handleSend = async () => {
    if (!message.trim()) return toast.error("Enter a message");
    const phone = getPhone();
    if (!phone) return toast.error("No phone number on this contact");

    const finalMessage = buildFinalMessage();

    setSending(true);
    try {
      await logWhatsAppMessage({
        contact: contact._id,
        phone,
        message: finalMessage,
        templateName: selectedTemplate || "",
        aiRewritten: false,
      });

      const waLink = getWaLink(finalMessage);
      if (waLink) window.open(waLink, "_blank");

      toast.success("Message logged & WhatsApp opened");
      onSent?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to log message");
    } finally {
      setSending(false);
    }
  };

  const addDriveLink = () => setDriveLinks((prev) => [...prev, ""]);
  const removeDriveLink = (i) => setDriveLinks((prev) => prev.filter((_, idx) => idx !== i));
  const updateDriveLink = (i, val) => setDriveLinks((prev) => prev.map((l, idx) => (idx === i ? val : l)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg w-full animate-[scale-in_0.2s_ease-out] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-primary">WhatsApp Message</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!getPhone() && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4 text-sm text-warning">
            No phone number on this contact. Add one first.
          </div>
        )}

        <div className="space-y-3 mb-4">
          <label className="block text-xs font-medium text-muted">Templates ({TEMPLATES.length})</label>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                onClick={() => fillTemplate(tpl)}
                className={`btn btn-xs shrink-0 ${selectedTemplate === tpl.name ? "btn-primary" : "btn-secondary"}`}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            rows={4}
            className="input resize-none"
            placeholder="Type your WhatsApp message..."
            value={message}
            onChange={(e) => { setMessage(e.target.value); setSelectedTemplate(null); }}
          />

          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted">Attach Resume</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setAttachType("none"); setSelectedResume(null); setDriveLinks([""]); }}
                className={`btn btn-xs ${attachType === "none" ? "btn-primary" : "btn-secondary"}`}
              >
                None
              </button>
              <button
                onClick={() => setAttachType("resume")}
                className={`btn btn-xs ${attachType === "resume" ? "btn-primary" : "btn-secondary"}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                My Resume
              </button>
              <button
                onClick={() => setAttachType("drive")}
                className={`btn btn-xs ${attachType === "drive" ? "btn-primary" : "btn-secondary"}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                Drive Link
              </button>
              <label className="cursor-pointer">
                <input type="file" accept=".pdf" onChange={handleUploadResume} className="sr-only" disabled={uploading} />
                <span className={`btn btn-xs ${uploading ? "opacity-50" : "btn-secondary"} cursor-pointer`}>
                  {uploading ? "Uploading..." : "+ Upload PDF"}
                </span>
              </label>
            </div>

            {attachType === "resume" && (
              <div className="mt-2">
                {resumesLoading ? (
                  <p className="text-xs text-muted">Loading resumes...</p>
                ) : resumes.length === 0 ? (
                  <p className="text-xs text-muted">No resumes uploaded yet. Upload one above.</p>
                ) : (
                  <select
                    value={selectedResume?._id || ""}
                    onChange={(e) => {
                      const r = resumes.find((r) => r._id === e.target.value);
                      setSelectedResume(r || null);
                    }}
                    className="input text-xs py-1.5"
                  >
                    <option value="">Select a resume...</option>
                    {resumes.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.originalName} {r.isDefault ? "(Default)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {selectedResume && (
                  <a href={selectedResume.cloudinaryUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline mt-1 inline-block">
                    Preview resume ↗
                  </a>
                )}
              </div>
            )}

            {attachType === "drive" && (
              <div className="mt-2 space-y-2">
                {driveLinks.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://drive.google.com/file/d/... or any shareable link"
                      className="input text-xs flex-1"
                      value={link}
                      onChange={(e) => updateDriveLink(i, e.target.value)}
                    />
                    {driveLinks.length > 1 && (
                      <button onClick={() => removeDriveLink(i)} className="btn btn-xs btn-ghost text-red-500 p-1" title="Remove">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addDriveLink} className="btn btn-xs btn-ghost text-accent">
                  + Add another link
                </button>
              </div>
            )}

            {getAttachLinks().length > 0 && (
              <p className="text-xs text-success mt-1">
                {getAttachLinks().length} link(s) will be appended to the message
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">Tone:</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="input py-1 px-2 text-xs w-auto">
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
            </select>
            <button onClick={handleRewrite} disabled={rewriting || !message.trim()} className="btn btn-sm btn-warning ml-auto">
              {rewriting ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Rewriting...</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> AI Rewrite</>
              )}
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button onClick={handleSend} disabled={sending || !message.trim() || !getPhone()} className="btn btn-success">
              {sending ? "Logging..." : (
                <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Open WhatsApp</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
