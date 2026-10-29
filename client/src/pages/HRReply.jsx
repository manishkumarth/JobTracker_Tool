import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listTemplates } from "../api/templates.js";
import { listResumes } from "../api/resumes.js";
import { generateDetailReply } from "../api/ai.js";
import { sendMail } from "../api/emails.js";
import { useGmailGuard } from "../context/GmailContext.jsx";

const TYPES = ["Job Application", "Follow-up", "Thank You", "Interview", "Referral", "Other"];

export default function HRReply() {
  const { requireGmail } = useGmailGuard();
  const [requestText, setRequestText] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [emailType, setEmailType] = useState("Recruiter Response");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoDraft, setAutoDraft] = useState(false);
  const [autoSend, setAutoSend] = useState(false);

  useEffect(() => {
    listTemplates().then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
    listResumes().then((d) => {
      const list = Array.isArray(d) ? d : d?.resumes || [];
      setResumes(list);
      const def = list.find((r) => r.isDefault);
      if (def) setResumeId(def._id);
    }).catch(() => {});
  }, []);

  // Auto-extract a recruiter email from the pasted request
  useEffect(() => {
    const compact = requestText.replace(/\s+/g, " ");
    const m = compact.match(/([\w.-]+)\s*@\s*([\w-]+)\s*\.\s*([a-zA-Z]{2,})/i);
    if (m) {
      const email = `${m[1]}@${m[2]}.${m[3]}`.replace(/\s+/g, "");
      setRecipientEmail((prev) => (prev ? prev : email));
    }
    const fromMatch = compact.match(/From\s+([A-Za-z][A-Za-z ]{1,40}?)\s+[\w.-]+@/i);
    if (fromMatch) {
      setRecipientName((prev) => (prev ? prev : fromMatch[1].trim()));
    }
  }, [requestText]);

  // Auto-draft when the toggle is on
  useEffect(() => {
    if (!autoDraft || requestText.trim().length < 20) return;
    const t = setTimeout(() => {
      const tid = templateId || (templates.length ? templates[0]._id : "");
      if (!templateId && tid) setTemplateId(tid);
      handleGenerate({ templateId: tid || undefined, autoSend });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestText, autoDraft, templates, autoSend]);

  const handleGenerate = async (opts = {}) => {
    const tid = opts.templateId || templateId;
    const doAutoSend = opts.autoSend ?? autoSend;
    if (!requestText.trim()) {
      toast.error("Paste the recruiter's request first");
      return;
    }
    setGenerating(true);
    try {
      const data = await generateDetailReply({
        requestText,
        recipientName,
        recipientEmail,
        templateId: tid || undefined,
        detailsOnly: true, // only name, email, contact, portfolio, LinkedIn, GitHub
      });
      setSubject(data.subject || "");
      setBody(data.body || "");
      if (doAutoSend && recipientEmail.trim()) {
        if (!requireGmail()) {
          setGenerating(false);
          return;
        }
        const result = await sendMail({
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          subject: data.subject || "",
          message: data.body || "",
          resumeId: resumeId || undefined,
          emailType,
          isAiGenerated: true,
          detailsOnly: true,
        });
        const sent = result?.results?.filter((r) => r.status === "sent").length || 0;
        toast.success(sent > 0 ? "Reply generated and sent" : "Reply generated but send failed");
      } else {
        toast.success("Reply drafted - review and send");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to generate reply");
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!requireGmail()) return;
    if (!recipientEmail.trim() || !subject.trim() || !body.trim()) {
      toast.error("Recipient email, subject and body are required");
      return;
    }
    setSending(true);
    try {
      const result = await sendMail({
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim(),
        subject,
        message: body,
        resumeId: resumeId || undefined,
        emailType,
        isAiGenerated: true,
        detailsOnly: true,
      });
      const sent = result?.results?.filter((r) => r.status === "sent").length || 0;
      if (sent > 0) toast.success("Reply sent");
      else toast.error("Failed to send reply");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Reply to Recruiter</h1>
        <p className="page-subtitle">Paste what the HR asked, and I'll draft a reply using your profile details (CTC, notice period, experience, ...).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: request inputs */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="section-title">Recruiter's request</h2>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Paste their email / question</label>
              <textarea
                rows={8}
                className="input w-full font-mono text-xs"
                placeholder={"e.g.\nHi Manish,\nCould you please share:\n- Total experience\n- Current CTC & expected CTC\n- Notice period\n- Current location\nThanks,\nHR"}
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
              />
              <label className="flex items-center gap-2 mt-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={autoDraft}
                  onChange={(e) => setAutoDraft(e.target.checked)}
                  className="rounded"
                />
                Auto-draft reply as I type
              </label>
              <label className="flex items-center gap-2 mt-1 text-xs text-muted">
                <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="rounded" />
                Auto-send after drafting
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Recipient (HR) email</label>
                <input className="input w-full" placeholder="hr@company.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Recipient name</label>
                <input className="input w-full" placeholder="Pragya Shri" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Drafted reply</h2>
              <div className="flex items-center gap-2">
                <select className="input text-xs" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">No template (auto)</option>
                  {templates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || !requestText.trim()}
                  className="btn btn-sm btn-warning whitespace-nowrap"
                >
                  {generating ? "Drafting…" : "Draft reply with AI"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Subject</label>
              <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Body</label>
              <textarea rows={10} className="input w-full" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            {body.trim() && (
              <div className="flex items-center gap-2">
                <select className="input text-xs" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                  <option value="">No resume attached</option>
                  {resumes.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.originalName}{r.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <select className="input text-xs" value={emailType} onChange={(e) => setEmailType(e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !subject.trim() || !body.trim()}
                  className="btn btn-primary btn-sm ml-auto whitespace-nowrap"
                >
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column tips */}
        <div className="space-y-6">
          <div className="card p-6 space-y-3 text-sm text-secondary">
            <h3 className="font-semibold text-primary">Tips</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Make sure your profile has current/expected CTC, notice period and total experience filled.</li>
              <li>Pick a template to match your company's email style.</li>
              <li>The reply's CTC/experience values come only from your profile — no guesswork.</li>
              <li>Gmail must be connected in Settings before sending.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
