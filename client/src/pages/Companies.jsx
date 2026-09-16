import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listCompanies, createCompany, deleteCompany, bulkDeleteCompanies } from "../api/companies.js";
import EmptyState from "../components/EmptyState.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

export default function Companies() {
  const [data, setData] = useState({ companies: [], pages: 1 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", location: "", industry: "" });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === data.companies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.companies.map((c) => c._id)));
    }
  };

  const handleSingleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteCompany(id);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Company deleted");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete company");
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await bulkDeleteCompanies(ids);
      setSelected(new Set());
      toast.success(`${ids.length} companies deleted`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete companies");
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

      {!loading && data.companies.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === data.companies.length && data.companies.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-color text-brand-600 focus:ring-brand-500"
            />
            <span className="text-muted">
              {selected.size === 0
                ? `${data.companies.length} companies`
                : `${selected.size} of ${data.companies.length} selected`}
            </span>
          </label>
        </div>
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
          {data.companies.map((c) => {
            const isSelected = selected.has(c._id);
            return (
              <Link
                key={c._id}
                to={`/companies/${c._id}`}
                className={`card card-hover p-5 block relative ${isSelected ? "ring-2 ring-brand-500" : ""}`}
              >
                <div className="absolute top-3 left-3 pointer-events-auto">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(c._id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-color text-brand-600 focus:ring-brand-500"
                  />
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(c._id); }}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors pointer-events-auto"
                  title="Delete company"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <div className="pt-5 pointer-events-none">
                  <h3 className="font-semibold text-primary mb-2 pr-6">{c.name}</h3>
                  <div className="space-y-1 text-sm text-secondary mb-3">
                    {c.industry && <p>{c.industry}</p>}
                    {c.location && <p>{c.location}</p>}
                    {c.website && <p className="text-accent text-xs">{c.website}</p>}
                  </div>
                  <div className="flex gap-2">
                    <span className="badge badge-primary">{c.contacts?.length ?? 0} contacts</span>
                    <span className="badge badge-neutral">{c.applications?.length ?? 0} apps</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {data.pages > 1 && (
        <div className="flex justify-center items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-secondary btn-sm">Prev</button>
          <span className="text-muted">{page} / {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn btn-secondary btn-sm">Next</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-color shadow-lg animate-slide-up">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-primary">{selected.size} selected</span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set())} className="btn btn-sm btn-ghost">Clear</button>
              <button
                onClick={handleBulkDelete}
                className="btn btn-sm btn-danger"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleSingleDelete}
        title="Delete company"
        message="This company will be permanently deleted. Linked contacts and applications will be unlinked."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
