import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listCompanies, createCompany } from "../api/companies.js";
import EmptyState from "../components/EmptyState.jsx";

export default function Companies() {
  const [data, setData] = useState({ companies: [], pages: 1 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", location: "", industry: "" });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    listCompanies({ search, page, limit: 20 })
      .then(setData)
      .catch(() => toast.error("Failed to load companies"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, page]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createCompany(form);
      toast.success("Company added");
      setShowForm(false);
      setForm({ name: "", website: "", location: "", industry: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add company");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Companies</h1>
          <p className="page-subtitle">{data.companies.length} companies total</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          + Add company
        </button>
      </div>

      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          placeholder="Search companies..."
          className="input pl-10"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-6 space-y-4 animate-slide-up">
          <h2 className="text-lg font-bold text-accent">Add company</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input required placeholder="Company name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Website" className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <input placeholder="Location" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <input placeholder="Industry" className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
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
      ) : data.companies.length === 0 ? (
        <EmptyState title="No companies yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
          {data.companies.map((c) => (
            <Link key={c._id} to={`/companies/${c._id}`} className="card card-hover p-5 block">
              <h3 className="font-semibold text-primary mb-2">{c.name}</h3>
              <div className="space-y-1 text-sm text-secondary mb-3">
                {c.industry && <p>{c.industry}</p>}
                {c.location && <p>{c.location}</p>}
                {c.website && <p className="text-accent text-xs">{c.website}</p>}
              </div>
              <div className="flex gap-2">
                <span className="badge badge-primary">{c.contacts?.length ?? 0} contacts</span>
                <span className="badge badge-neutral">{c.applications?.length ?? 0} apps</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data.pages > 1 && (
        <div className="flex justify-center items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-secondary btn-sm">Prev</button>
          <span className="text-muted">{page} / {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn btn-secondary btn-sm">Next</button>
        </div>
      )}
    </div>
  );
}
