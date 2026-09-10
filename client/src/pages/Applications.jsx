import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listApplications, APPLICATION_STATUSES, bulkUpdateStatus, bulkScheduleFollowUp, bulkDeleteApplications } from "../api/applications.js";
import StatusBadge from "../components/StatusBadge.jsx";
import ApplicationFormModal from "../components/ApplicationFormModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

export default function Applications() {
  const [data, setData] = useState({ applications: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState("");
  const [bulkFollowUpType, setBulkFollowUpType] = useState("General");
  const [bulkFollowUpNote, setBulkFollowUpNote] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    setLoading(true);
    listApplications({ search, status, page, limit: 15 })
      .then(setData)
      .catch(() => toast.error("Failed to load applications"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, status, page]);

  const toggleSelectAll = () => {
    if (selectedIds.length === data.applications.length) setSelectedIds([]);
    else setSelectedIds(data.applications.map((a) => a._id));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleBulkAction = async (action) => {
    if (!selectedIds.length) return toast.error("No applications selected");
    setBulkAction(action);
  };

  const executeBulkAction = async () => {
    try {
      if (bulkAction === "status") {
        await bulkUpdateStatus(selectedIds, bulkStatus);
        toast.success(`Updated ${selectedIds.length} applications`);
      } else if (bulkAction === "followup") {
        await bulkScheduleFollowUp(selectedIds, bulkFollowUpDate, bulkFollowUpType, bulkFollowUpNote);
        toast.success(`Scheduled follow-ups for ${selectedIds.length} applications`);
      } else if (bulkAction === "delete") {
        await bulkDeleteApplications(selectedIds);
        toast.success(`Deleted ${selectedIds.length} applications`);
      }
      setSelectedIds([]);
      setBulkAction(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Bulk action failed");
    }
  };

  const confirmBulkDelete = () => {
    setConfirmDialog({
      title: "Delete applications",
      message: `Are you sure you want to delete ${selectedIds.length} application(s)? This cannot be undone.`,
      onConfirm: () => executeBulkAction(),
      onCancel: () => setConfirmDialog(null),
    });
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(data.pages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  if (confirmDialog) {
    return (
      <ConfirmDialog
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">{data.total} total applications</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Application
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by job title, company, HR..."
          className="input pl-12"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Status Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          onClick={() => { setPage(1); setStatus(""); }}
          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            status === "" ? "btn-primary" : "btn-secondary"
          }`}
        >
          All
        </button>
        {APPLICATION_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setPage(1); setStatus(s); }}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              status === s ? "btn-primary" : "btn-secondary"
            }`}
          >
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {/* Applications Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="skeleton h-5 w-3/4 mb-3" />
              <div className="skeleton h-3 w-1/2 mb-4" />
              <div className="flex gap-2">
                <div className="skeleton h-6 rounded-full w-16" />
                <div className="skeleton h-6 rounded-full w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : data.applications.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-tertiary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-primary mb-1">No applications found</h3>
          <p className="text-sm text-muted mb-6">
            {search || status ? "Try adjusting your search or filters" : "Start tracking your job applications"}
          </p>
          {!search && !status && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add your first application
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center gap-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === data.applications.length && data.applications.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
              />
              <span className="text-sm text-muted">
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select all"}
              </span>
            </label>
          </div>

          {/* Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {data.applications.map((a) => (
              <div key={a._id} className="group relative">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(a._id)}
                  onChange={() => toggleSelect(a._id)}
                  className="absolute top-4 left-4 w-4 h-4 rounded border-border-strong text-accent focus:ring-accent z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <Link
                  to={`/applications/${a._id}`}
                  className="block card card-hover p-5 h-full"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-primary truncate">{a.jobTitle}</p>
                      <p className="text-sm text-muted truncate mt-0.5">
                        {a.company?.name || a.companyName || "—"}
                      </p>
                    </div>
                    {a.matchScore != null && (
                      <span className={`shrink-0 ml-3 text-xs font-bold px-2.5 py-1 rounded-lg ${
                        a.matchScore >= 80 ? "badge-success" :
                        a.matchScore >= 60 ? "badge-warning" :
                        "badge-danger"
                      }`}>
                        {a.matchScore}%
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <StatusBadge status={a.status} />
                    {a.workMode && <span className="badge badge-neutral text-xs">{a.workMode}</span>}
                    {a.employmentType && <span className="badge badge-neutral text-xs">{a.employmentType}</span>}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted mt-auto pt-2 border-t border-color">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {a.applicationDate ? new Date(a.applicationDate).toLocaleDateString() : "Not applied"}
                    </span>
                    {a.location && (
                      <span className="flex items-center gap-1 truncate ml-2">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {a.location}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary btn-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Prev
              </button>
              {getPageNumbers().map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                    p === page ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn-secondary btn-sm">
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <select className="input text-xs w-auto" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                      <option value="">Status...</option>
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                    <button disabled={!bulkStatus} onClick={() => handleBulkAction("status")} className="btn-primary btn-sm">
                      Apply
                    </button>
                  </div>

                  <div className="w-px h-6 bg-border-color" />

                  {/* Follow-up */}
                  <div className="flex items-center gap-1.5">
                    <input type="date" className="input text-xs w-auto" value={bulkFollowUpDate} onChange={(e) => setBulkFollowUpDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
                    <select className="input text-xs w-auto" value={bulkFollowUpType} onChange={(e) => setBulkFollowUpType(e.target.value)}>
                      <option value="General">Follow-up</option>
                      <option value="Call">Call</option>
                      <option value="Email">Email</option>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="Other">Other</option>
                    </select>
                    <input type="text" placeholder="Note..." className="input text-xs w-32" value={bulkFollowUpNote} onChange={(e) => setBulkFollowUpNote(e.target.value)} />
                    <button disabled={!bulkFollowUpDate} onClick={() => handleBulkAction("followup")} className="btn-warning btn-sm">
                      Schedule
                    </button>
                  </div>

                  <div className="w-px h-6 bg-border-color" />

                  <button onClick={confirmBulkDelete} className="btn-danger btn-sm">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ApplicationFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
