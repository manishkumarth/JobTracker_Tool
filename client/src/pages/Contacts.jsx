import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listContacts, createContact, deleteContact, bulkDeleteContacts } from "../api/contacts.js";
import { listCompanies } from "../api/companies.js";
import EmptyState from "../components/EmptyState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const CONTACT_TYPES = ["HR", "Recruiter", "Hiring Manager", "Founder", "Employee", "Referral", "Other"];

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // grid | list
  const [form, setForm] = useState({ name: "", email: "", phone: "", companyRef: "", designation: "", contactType: "HR", linkedinUrl: "", location: "", notes: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    setLoading(true);
    listContacts({ search })
      .then((d) => setContacts(Array.isArray(d) ? d : d.contacts))
      .catch(() => toast.error("Failed to load contacts"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    listCompanies({ limit: 100 })
      .then((d) => setCompanies(d.companies))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    // Manual creation: no field required except at least one identifier
    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) {
      toast.error("At least one of Name, Email or Phone is required");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Invalid email format");
      return;
    }
    setBusy(true);
    try {
      await createContact({ ...form, companyRef: form.companyRef || null });
      toast.success("Contact added");
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", companyRef: "", designation: "", contactType: "HR", linkedinUrl: "", location: "", notes: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add contact");
    } finally {
      setBusy(false);
    }
  };

  const getCompanyName = (c) => c.companyRef?.name || c.company || "";

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) setSelectedIds([]);
    else setSelectedIds(contacts.map((c) => c._id));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDeleteOne = (id, name) => {
    setConfirmDialog({
      title: "Delete contact",
      message: `Delete "${name || "this contact"}"? Linked applications will be unlinked. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteContact(id);
          toast.success("Contact deleted");
          setSelectedIds((prev) => prev.filter((x) => x !== id));
          setConfirmDialog(null);
          load();
        } catch (err) {
          toast.error(err.response?.data?.message || "Delete failed");
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return toast.error("No contacts selected");
    setConfirmDialog({
      title: "Delete contacts",
      message: `Delete ${selectedIds.length} contact(s)? Linked applications will be unlinked. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await bulkDeleteContacts(selectedIds);
          toast.success(`Deleted ${selectedIds.length} contacts`);
          setSelectedIds([]);
          setConfirmDialog(null);
          load();
        } catch (err) {
          toast.error(err.response?.data?.message || "Bulk delete failed");
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  if (confirmDialog) {
    return (
      <ConfirmDialog
        title={confirmDialog.title}
        message={confirmDialog.message}
        danger
        confirmLabel="Delete"
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{contacts.length} contacts total — manual creation allowed, no field is mandatory (at least one of name/email/phone)</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="hidden sm:flex items-center rounded-lg border border-color overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2 text-sm ${viewMode === "grid" ? "bg-tertiary text-primary" : "text-muted hover:text-primary"}`}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-sm ${viewMode === "list" ? "bg-tertiary text-primary" : "text-muted hover:text-primary"}`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            + Add contact
          </button>
        </div>
      </div>

      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          placeholder="Search name, email, phone..."
          className="input pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-accent">Add contact</h2>
              <p className="text-xs text-muted mt-1">All fields optional — fill what you have. At least one of <span className="font-medium text-primary">Name / Email / Phone</span> is required.</p>
            </div>
            <span className="badge badge-neutral text-xs">Manual entry</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input placeholder="Name (optional)" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email (optional)" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Phone (optional)" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select className="input" value={form.companyRef} onChange={(e) => setForm({ ...form, companyRef: e.target.value })}>
              <option value="">No company</option>
              {companies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input placeholder="Designation (optional)" className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <select className="input" value={form.contactType} onChange={(e) => setForm({ ...form, contactType: e.target.value })}>
              {CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="LinkedIn URL (optional)" className="input" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
            <input placeholder="Location (optional)" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <textarea placeholder="Notes (optional)" rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button>
            <button disabled={busy} className="btn btn-primary">{busy ? "Saving..." : "Save contact"}</button>
          </div>
        </form>
      )}

      {/* Select all */}
      {!loading && contacts.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.length === contacts.length && contacts.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
            />
            <span className="text-sm text-muted">
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select all"}
            </span>
          </label>
          {selectedIds.length > 0 && (
            <button onClick={() => setSelectedIds([])} className="text-sm text-muted hover:text-primary underline">
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className={viewMode === "list" ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-5 w-2/3 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState title="No contacts yet." />
      ) : viewMode === "list" ? (
        /* List view - table-like rows with application data + delete */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-tertiary text-muted text-xs uppercase">
                <tr>
                  <th className="w-10 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === contacts.length && contacts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Contact</th>
                  <th className="text-left px-4 py-3 font-medium">Company</th>
                  <th className="text-left px-4 py-3 font-medium">Applications</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {contacts.map((c) => (
                  <tr key={c._id} className={`hover:bg-tertiary/50 transition-colors ${selectedIds.includes(c._id) ? "bg-tertiary/30" : ""}`}>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c._id)}
                        onChange={() => toggleSelect(c._id)}
                        className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-tertiary flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                          {(c.name || c.email || c.phone || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <Link to={`/contacts/${c._id}`} className="font-medium text-primary hover:underline truncate block">
                            {c.name || c.email || c.phone || "Unnamed contact"}
                          </Link>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            <span className="badge badge-primary text-[10px]">{c.contactType || "HR"}</span>
                            {c.designation && <span className="text-xs text-muted">{c.designation}</span>}
                          </div>
                          <div className="text-xs text-muted truncate">
                            {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-primary truncate max-w-[160px]">{getCompanyName(c) || "—"}</div>
                      {c.location && <div className="text-xs text-muted truncate">{c.location}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {c.applications?.length > 0 ? (
                        <div className="space-y-1.5 max-w-[320px]">
                          {c.applications.slice(0, 3).map((a) => (
                            <Link
                              key={a._id}
                              to={`/applications/${a._id}`}
                              className="flex items-center justify-between gap-2 bg-tertiary rounded-lg px-2.5 py-1.5 hover:bg-[var(--border-color)] transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate text-xs font-medium text-primary">
                                {a.jobTitle}
                                <span className="text-muted font-normal"> · {a.company?.name || a.companyName || "—"}</span>
                              </span>
                              <StatusBadge status={a.status} />
                            </Link>
                          ))}
                          {c.applicationCount > 3 && (
                            <Link to={`/contacts/${c._id}`} className="text-xs text-accent hover:underline">
                              +{c.applicationCount - 3} more
                            </Link>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">No applications</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.phone && (
                          <a
                            href={`https://wa.me/${c.phone.replace(/[^0-9+]/g, "").replace(/^\+/, "")}${localStorage.getItem("waApp") === "wab" ? "?app_absent=0" : ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                            title="WhatsApp"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          </a>
                        )}
                        <Link to={`/contacts/${c._id}`} className="btn btn-ghost btn-sm text-xs">
                          View
                        </Link>
                        <button
                          onClick={() => handleDeleteOne(c._id, c.name || c.email)}
                          className="btn btn-ghost btn-sm text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete contact"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
          {contacts.map((c) => (
            <div key={c._id} className={`group relative card card-hover p-5 ${selectedIds.includes(c._id) ? "ring-2 ring-accent" : ""}`}>
              <input
                type="checkbox"
                checked={selectedIds.includes(c._id)}
                onChange={() => toggleSelect(c._id)}
                className="absolute top-4 left-4 w-4 h-4 rounded border-border-strong text-accent focus:ring-accent z-10"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => handleDeleteOne(c._id, c.name || c.email)}
                className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-tertiary hover:bg-red-50 dark:hover:bg-red-900/30 text-muted hover:text-red-600 flex items-center justify-center transition-colors z-10"
                title="Delete contact"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
              <Link to={`/contacts/${c._id}`} className="block">
                <div className="flex items-start justify-between mb-2 ml-6 mr-6">
                  <h3 className="font-semibold text-primary truncate pr-2">{c.name || c.email || c.phone || "Unnamed contact"}</h3>
                  <span className="badge badge-primary text-xs shrink-0">{c.contactType || "HR"}</span>
                </div>
                <div className="space-y-1 text-sm text-secondary mb-3 ml-6">
                  {c.email && <p className="truncate">{c.email}</p>}
                  {c.phone && <p>{c.phone}</p>}
                  {getCompanyName(c) && <p className="truncate text-xs text-muted">{c.designation ? `${c.designation} · ` : ""}{getCompanyName(c)}</p>}
                  {c.location && !getCompanyName(c) && <p className="text-xs text-muted truncate">{c.location}</p>}
                  {!c.email && !c.phone && !getCompanyName(c) && <p className="text-xs text-muted">No contact info yet</p>}
                </div>

                {/* Application section data inline */}
                <div className="border-t border-color pt-3 ml-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted">Applications</span>
                    <span className="badge badge-neutral text-[10px]">{c.applicationCount ?? c.applications?.length ?? 0}</span>
                  </div>
                  {c.applications?.length > 0 ? (
                    <div className="space-y-1.5">
                      {c.applications.slice(0, 2).map((a) => (
                        <div key={a._id} className="flex items-center justify-between gap-2 bg-tertiary rounded-lg px-2.5 py-1.5">
                          <span className="truncate text-xs font-medium text-primary">
                            {a.jobTitle}
                            <span className="text-muted font-normal"> · {a.company?.name || a.companyName || "—"}</span>
                          </span>
                          <StatusBadge status={a.status} />
                        </div>
                      ))}
                      {c.applicationCount > 2 && (
                        <p className="text-xs text-accent">+{c.applicationCount - 2} more</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No linked applications</p>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Bulk delete bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 animate-slide-up">
          <div className="glass border-t border-color shadow-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-primary">
                    {selectedIds.length} selected
                  </span>
                  <button onClick={() => setSelectedIds([])} className="text-sm text-muted hover:text-primary underline">
                    Clear
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleBulkDelete} className="btn btn-danger btn-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete ({selectedIds.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
