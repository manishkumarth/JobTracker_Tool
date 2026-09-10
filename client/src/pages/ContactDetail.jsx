import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getContact } from "../api/contacts.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function ContactDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getContact(id)
      .then(setData)
      .catch(() => toast.error("Failed to load contact"))
      .finally(() => setLoading(false));
  }, [id]);

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
        <a href={`mailto:${contact.email}`} className="btn btn-secondary btn-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          Email
        </a>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            Call
          </a>
        )}
        <button onClick={() => navigator.clipboard.writeText(contact.email).then(() => toast.success("Copied email"))} className="btn btn-ghost btn-sm">
          Copy email
        </button>
        {contact.phone && (
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
        </div>
      </div>

      {contact.notes && (
        <div className="card p-5">
          <h2 className="section-title mb-3">Notes</h2>
          <p className="text-sm text-secondary">{contact.notes}</p>
        </div>
      )}
    </div>
  );
}
