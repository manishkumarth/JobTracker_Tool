import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { generateEmail, refineEmail } from "../api/ai.js";
import { sendMail } from "../api/emails.js";
import { listTemplates } from "../api/templates.js";
import { listResumes } from "../api/resumes.js";
import { getProfile } from "../api/profile.js";

const replaceVariables = (text, app) => {
  if (!text) return text;
  return text
    .replace(/\{\{jobTitle\}\}/g, app.jobTitle || "")
    .replace(/\{\{companyName\}\}/g, app.companyName || "")
    .replace(/\{\{recruiterName\}\}/g, app.hrName || "")
    .replace(/\{\{hrName\}\}/g, app.hrName || "")
    .replace(/\{\{candidateName\}\}/g, app.candidateName || "")
    .replace(/\{\{skills\}\}/g, app.skills || "")
    .replace(/\{\{location\}\}/g, app.location || "")
    .replace(/\{\{date\}\}/g, new Date().toLocaleDateString());
};

export default function AIEmailGenerator({ application, onSent }) {
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("short");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [resumes, setResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    listResumes().then((d) => setResumes(d.resumes || [])).catch(() => {});
    listTemplates().then((d) => setTemplates(d.templates || d || [])).catch(() => {});
    getProfile().then((p) => setProfile(p)).catch(() => {});
  }, []);

  const appWithProfile = {
    ...application,
    candidateName: profile?.name || "",
    skills: (profile?.skills || []).join(", "),
  };

  const loadTemplate = (templateId) => {
    const template = templates.find((t) => t._id === templateId);
    if (!template) return;
    setSubject(replaceVariables(template.subject, appWithProfile));
    setBody(replaceVariables(template.body, appWithProfile));
    setSelectedTemplateId(templateId);
    setShowTemplatePanel(false);
    setHasGenerated(false);
    toast.success(`Template "${template.name}" loaded`);
  };

  const generate = async () => {
    if (!application.hrEmail) return toast.error("Add an HR email on this application first");
    setGenerating(true);
    try {
      const result = await generateEmail({ applicationId: application._id, tone, length });
      setSubject(result.subject);
      setBody(result.body);
      setHasGenerated(true);
      setSelectedTemplateId("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to generate email");
    } finally {
      setGenerating(false);
    }
  };

  const applyRefine = async (instruction) => {
    if (!body) return;
    setRefining(true);
    try {
      const result = await refineEmail({ currentSubject: subject, currentBody: body, instruction });
      setSubject(result.subject);
      setBody(result.body);
      setHasGenerated(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to refine email");
    } finally {
      setRefining(false);
    }
  };

  const send = async () => {
    const hasContact = !!application.contact;
    const hasHrEmail = !!application.hrEmail;
    if (!hasContact && !hasHrEmail) return toast.error("This application has no linked contact or HR email. Add one from the HR section.");
    if (!subject || !body) return toast.error("Generate or write an email first");

    setSending(true);
    try {
      const payload = {
        subject,
        message: body,
        resumeId: selectedResumeId || undefined,
        applicationId: application._id,
        isAiGenerated: hasGenerated,
        emailType: "Job Application",
        allowResend: true,
      };

      if (hasContact) {
        payload.contactIds = [application.contact._id || application.contact];
      } else {
        payload.recipientEmail = application.hrEmail;
        payload.recipientName = application.hrName || "";
      }

      const result = await sendMail(payload);
      const sent = result.results.filter((r) => r.status === "sent").length;
      if (sent > 0) toast.success("Email sent successfully!");
      else toast.error("Send failed — check email history for details");
      onSent?.();
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error(err.response.data.message);
      } else {
        toast.error(err.response?.data?.message || "Failed to send");
      }
    } finally {
      setSending(false);
    }
  };

  const templateTypes = [...new Set(templates.map((t) => t.type))];
  const selectedTemplateName = templates.find((t) => t._id === selectedTemplateId)?.name;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-primary flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <span>AI Email Assistant</span>
        </h2>
        {selectedTemplateName && (
          <span className="badge badge-primary text-xs">{selectedTemplateName}</span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowTemplatePanel(!showTemplatePanel)}
          className={`btn text-xs ${showTemplatePanel ? "btn-primary" : "btn-secondary"}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Templates
        </button>
        <select value={tone} onChange={(e) => setTone(e.target.value)} className="input text-xs w-auto">
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="direct">Direct</option>
        </select>
        <select value={length} onChange={(e) => setLength(e.target.value)} className="input text-xs w-auto">
          <option value="short">Short</option>
          <option value="medium">Medium</option>
        </select>
        <button onClick={generate} disabled={generating} className="btn-primary text-xs">
          {generating ? (
            <><span className="inline-block animate-spin w-3 h-3 border-2 border-white/30 border-t-white rounded-full" /> Generating...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> {hasGenerated ? "Regenerate" : "Generate with AI"}</>
          )}
        </button>
      </div>

      {/* Template Panel */}
      {showTemplatePanel && (
        <div className="border border-color rounded-xl p-3 space-y-2 animate-slide-down bg-tertiary/30">
          {templates.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">
              No templates yet. Create one in the Templates page.
            </p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {templateTypes.map((type) => (
                <div key={type}>
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5 px-1">{type}</p>
                  <div className="space-y-1">
                    {templates.filter((t) => t.type === type).map((t) => (
                      <button
                        key={t._id}
                        onClick={() => loadTemplate(t._id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          selectedTemplateId === t._id
                            ? "bg-accent text-white shadow-sm"
                            : "hover:bg-secondary text-primary"
                        }`}
                      >
                        <span className="font-medium">{t.name}</span>
                        <span className="ml-2 text-xs opacity-60 truncate">— {t.subject}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Editor */}
      {body ? (
        <div className="space-y-3 animate-fade-in">
          {/* Refine chips */}
          <div className="flex flex-wrap gap-1.5">
            {["Make shorter", "More professional", "More personalized", "Improve"].map((label) => (
              <button
                key={label}
                onClick={() => applyRefine(label)}
                disabled={refining}
                className="btn-secondary text-xs px-2.5 py-1 rounded-full"
              >
                {refining && label === "Make shorter" ? (
                  <span className="inline-block animate-spin w-3 h-3 border-2 border-current/30 border-t-current rounded-full" />
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                {label}
              </button>
            ))}
          </div>

          {/* Subject & Body */}
          <div className="space-y-2">
            <div className="relative">
              <label className="text-xs font-medium text-muted block mb-1">Subject</label>
              <input
                placeholder="Email subject..."
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="relative">
              <label className="text-xs font-medium text-muted block mb-1">Body</label>
              <textarea
                rows={10}
                placeholder="Write your email here..."
                className="input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>

          {/* Resume */}
          <div className="bg-tertiary/30 rounded-xl p-3 space-y-2">
            <label className="text-xs font-medium text-muted flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Attach Resume
            </label>
            <select value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)} className="input text-xs">
              <option value="">No resume attached</option>
              {resumes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.originalName} ({(r.size / 1024).toFixed(0)} KB) {r.isDefault && "— Default"}
                </option>
              ))}
            </select>
            {selectedResumeId && (
              <p className="text-xs text-success flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Resume will be attached from Cloudinary
              </p>
            )}
          </div>

          {/* Send Actions */}
          <div className="flex gap-2 pt-2 border-t border-color">
            <button
              onClick={() => navigator.clipboard.writeText(`${subject}\n\n${body}`).then(() => toast.success("Copied to clipboard"))}
              className="btn-secondary flex-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
              Copy
            </button>
            <button onClick={send} disabled={sending} className="btn-primary flex-1">
              {sending ? (
                <><span className="inline-block animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Sending...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg> Send via Gmail</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-10 text-muted">
          <div className="w-14 h-14 rounded-2xl bg-tertiary/50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <p className="text-sm font-medium text-secondary">Load a template or generate with AI</p>
          <p className="text-xs text-muted mt-1">Choose a template below or click Generate to create an email</p>
        </div>
      )}
    </div>
  );
}
