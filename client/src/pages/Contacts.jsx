import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listContacts, createContact } from "../api/contacts.js";
import { listCompanies } from "../api/companies.js";
import EmptyState from "../components/EmptyState.jsx";

const CONTACT_TYPES = ["HR", "Recruiter", "Hiring Manager", "Founder", "Employee", "Referral", "Other"];

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", companyRef: "", designation: "", contactType: "HR", linkedinUrl: "", location: "", notes: "" });

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

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{contacts.length} contacts total</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          + Add contact
        </button>
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
          <h2 className="text-lg font-bold text-accent">Add contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input placeholder="Name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required type="email" placeholder="Email *" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select className="input" value={form.companyRef} onChange={(e) => setForm({ ...form, companyRef: e.target.value })}>
              <option value="">No company</option>
              {companies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input placeholder="Designation" className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <select className="input" value={form.contactType} onChange={(e) => setForm({ ...form, contactType: e.target.value })}>
              {CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="LinkedIn URL" className="input" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
            <input placeholder="Location" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <textarea placeholder="Notes" rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button>
            <button disabled={busy} className="btn btn-primary">{busy ? "Saving..." : "Save"}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
          {contacts.map((c) => (
            <Link key={c._id} to={`/contacts/${c._id}`} className="card card-hover p-5 block">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-primary">{c.name || c.email}</h3>
                <span className="badge badge-primary text-xs">{c.contactType || "HR"}</span>
              </div>
              <div className="space-y-1 text-sm text-secondary">
                {c.email && <p className="truncate">{c.email}</p>}
                {c.phone && <p>{c.phone}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
