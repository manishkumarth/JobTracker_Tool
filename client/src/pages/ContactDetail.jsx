import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getContact } from "../api/contacts.js";
import { listWhatsAppMessages } from "../api/whatsapp.js";
import StatusBadge from "../components/StatusBadge.jsx";
import WhatsAppMessageComposer from "../components/WhatsAppMessageComposer.jsx";

export default function ContactDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [waApp, setWaApp] = useState(() => localStorage.getItem("waApp") || "wa");

  useEffect(() => {
    getContact(id)
      .then(setData)
      .catch(() => toast.error("Failed to load contact"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (data?.contact?._id) {
      listWhatsAppMessages({ contact: data.contact._id, limit: 50 })
        .then((d) => setWhatsappMessages(d.messages || []))
        .catch(() => {});
    }
  }, [data?.contact?._id]);

  if (loading) return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-1/3 rounded" />
      <div className="flex gap-2"><div className="skeleton h-8 w-20 rounded-full" /><div className="skeleton h-8 w-16 rounded-full" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5"><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-3 w-2/3 rounded" /></div>
        <div className="card p-5"><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-3 w-2/3 rounded" /></div>
      </div>
    </div>
  );
  if (!data) return <p className="text-muted text-sm">Contact not found.</p>;

  const { contact, applications, emails, calls } = data;
  const hasPhone = !!contact.phone;

  const getCleanPhone = () => {
    const raw = contact.phone || "";
    const cleaned = raw.replace(/[^0-9+]/g, "");
    if (cleaned.startsWith("+")) return cleaned.slice(1);
    return cleaned;
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Link to="/contacts" className="text-xs text-accent hover:underline mb-1 inline-block">← Back to contacts</Link>
          <h1 className="page-title">{contact.name || contact.email}</h1>
          <p className="page-subtitle">
            {contact.designation || "—"} {contact.contactType ? `· ${contact.contactType}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Email
          </a>
        )}
        {hasPhone && (
          <a href={`tel:${contact.phone}`} className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            Call
          </a>
        )}
        {hasPhone && (
          <a
            href={`https://wa.me/${getCleanPhone()}${waApp === "wab" ? "?app_absent=0" : ""}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm text-white"
            style={{ backgroundColor: "#25D366" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
        )}
        {hasPhone && (
          <button onClick={() => setShowComposer(true)} className="btn btn-sm" style={{ backgroundColor: "#25D366", color: "white" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            Compose WA
          </button>
        )}
        <button onClick={() => navigator.clipboard.writeText(contact.email).then(() => toast.success("Copied email"))} className="btn btn-ghost btn-sm">
          Copy email
        </button>
        {hasPhone && (
          <button onClick={() => navigator.clipboard.writeText(contact.phone).then(() => toast.success("Copied phone"))} className="btn btn-ghost btn-sm">
            Copy phone
          </button>
        )}
        {contact.linkedinUrl && (
          <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            LinkedIn ↗
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="section-title mb-3">Applications ({applications.length})</h2>
            {applications.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {applications.map((a) => (
                  <Link key={a._id} to={`/applications/${a._id}`} className="flex items-center justify-between py-3 text-sm hover-bg px-1 rounded transition-colors">
                    <span className="font-medium text-primary">{a.jobTitle}</span>
                    <StatusBadge status={a.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="section-title mb-3">Recent emails</h2>
            {emails.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {emails.map((e) => (
                  <li key={e._id} className="flex justify-between items-start gap-2">
                    <span className="truncate text-primary">{e.subject}</span>
                    <span className={`badge badge-sm ${e.status === "Sent" ? "badge-success" : e.status === "Failed" ? "badge-danger" : "badge-warning"}`}>{e.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="section-title mb-3">Call log</h2>
            {calls.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {calls.map((c) => (
                  <li key={c._id} className="flex justify-between items-center">
                    <span className="text-primary">{new Date(c.callDate).toLocaleDateString()}</span>
                    <span className="text-xs text-muted">{c.result}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="section-title mb-3">WhatsApp messages</h2>
            {whatsappMessages.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {whatsappMessages.map((m) => (
                  <li key={m._id} className="space-y-1">
                    <p className="text-primary line-clamp-2">{m.message}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted">{new Date(m.sentAt).toLocaleDateString()}</span>
                      <div className="flex gap-1">
                        {m.templateName && <span className="badge badge-sm badge-neutral">{m.templateName}</span>}
                        {m.aiRewritten && <span className="badge badge-sm badge-warning">AI</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {contact.notes && (
        <div className="card p-5">
          <h2 className="section-title mb-3">Notes</h2>
          <p className="text-sm text-secondary">{contact.notes}</p>
        </div>
      )}

      {showComposer && (
        <WhatsAppMessageComposer
          contact={contact}
          onClose={() => setShowComposer(false)}
          onSent={() => {
            listWhatsAppMessages({ contact: contact._id, limit: 50 })
              .then((d) => setWhatsappMessages(d.messages || []))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
