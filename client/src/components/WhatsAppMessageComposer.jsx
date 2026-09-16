import { useState } from "react";
import toast from "react-hot-toast";
import { rewriteWhatsAppMessage, logWhatsAppMessage } from "../api/whatsapp.js";

const TEMPLATES = [
  { name: "Follow-up", message: "Hi {name}, I hope you're doing well. I wanted to follow up on our recent conversation about the {role} position. Please let me know if there are any updates. Thank you!" },
  { name: "Thank You", message: "Hi {name}, thank you for taking the time to speak with me today. I really enjoyed learning more about the role and the team. Looking forward to hearing from you!" },
  { name: "Introduction", message: "Hi {name}, I'm {myName}, a {title} with experience in {skills}. I came across the {role} opening at {company} and wanted to reach out. Would love to connect!" },
  { name: "Referral Request", message: "Hi {name}, I hope you're well. I'm exploring new opportunities and saw that you work at {company}. Would you be open to referring me for the {role} position? Happy to share my resume. Thanks!" },
  { name: "Quick Check-in", message: "Hi {name}, just checking in! Hope things are going well. Let me know if there's anything I can help with." },
];

export default function WhatsAppMessageComposer({ contact, onClose, onSent }) {
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [rewriting, setRewriting] = useState(false);
  const [sending, setSending] = useState(false);
  const [tone, setTone] = useState("professional");

  const fillTemplate = (tpl) => {
    setSelectedTemplate(tpl.name);
    setMessage(tpl.message);
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

    setSending(true);
    try {
      await logWhatsAppMessage({
        contact: contact._id,
        phone,
        message,
        templateName: selectedTemplate || "",
        aiRewritten: false,
      });

      const waLink = getWaLink(message);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg w-full animate-[scale-in_0.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
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
          <label className="block text-xs font-medium text-muted">Templates</label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                onClick={() => fillTemplate(tpl)}
                className={`btn btn-xs ${selectedTemplate === tpl.name ? "btn-primary" : "btn-secondary"}`}
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
