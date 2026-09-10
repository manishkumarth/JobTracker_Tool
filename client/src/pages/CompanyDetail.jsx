import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getCompany } from "../api/companies.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function CompanyDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompany(id)
      .then(setData)
      .catch(() => toast.error("Failed to load company"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-1/3 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5"><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-3 w-2/3 rounded" /></div>
        <div className="card p-5"><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-3 w-2/3 rounded" /></div>
      </div>
    </div>
  );
  if (!data) return <p className="text-muted text-sm">Company not found.</p>;

  const { company, contacts, applications, emails, calls } = data;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Link to="/companies" className="text-xs text-accent hover:underline mb-1 inline-block">← Back to companies</Link>
          <h1 className="page-title">{company.name}</h1>
          <p className="page-subtitle">
            {company.industry || "—"} · {company.location || "—"} {company.size ? `· ${company.size}` : ""}
          </p>
        </div>
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            Website ↗
          </a>
        )}
      </div>

      {company.notes && (
        <div className="card p-4">
          <p className="text-sm text-secondary">{company.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="section-title mb-3">Contacts ({contacts.length})</h2>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts yet.</p>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {contacts.map((c) => (
                  <Link key={c._id} to={`/contacts/${c._id}`} className="flex items-center justify-between py-3 text-sm hover-bg px-1 rounded transition-colors">
                    <div>
                      <span className="font-medium text-primary">{c.name || c.email}</span>
                      <span className="text-muted ml-2">· {c.contactType}</span>
                    </div>
                    <span className="text-xs text-muted">{c.email}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="section-title mb-3">Applications ({applications.length})</h2>
            {applications.length === 0 ? (
              <p className="text-sm text-muted">No applications yet.</p>
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
            <h2 className="section-title mb-3">Recent calls</h2>
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
    </div>
  );
}
