import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  deleteTemplate,
} from "../api/templates.js";
import EmptyState from "../components/EmptyState.jsx";
const TYPES = [
  "Job Application",
  "Follow-up",
  "Interview Confirmation",
  "Interview Thank You",
  "Recruiter Follow-up",
  "Referral Request",
  "Cold Outreach",
  "Other",
];
const VARS = [
  "{{candidateName}}",
  "{{companyName}}",
  "{{jobTitle}}",
  "{{hrName}}",
  "{{recruiterName}}",
  "{{skills}}",
  "{{location}}",
  "{{date}}",
];

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () =>
    listTemplates()
      .then(setTemplates)
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing._id) await updateTemplate(editing._id, editing);
      else await createTemplate(editing);
      toast.success("Template saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save template");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (id, name) => {
    setConfirmDialog({
      title: "Delete template",
      message: `Are you sure you want to delete "${name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteTemplate(id);
          setTemplates((prev) => prev.filter((t) => t._id !== id));
          toast.success("Deleted");
        } catch {
          toast.error("Failed to delete");
        }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const duplicate = async (id) => {
    try {
      const copy = await duplicateTemplate(id);
      setTemplates((prev) => [copy, ...prev]);
      toast.success("Duplicated");
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  const extractVariables = (text) => {
    if (!text) return [];
    const matches = text.match(/\{\{[^}]+\}\}/g);
    return [...new Set(matches || [])];
  };

  if (confirmDialog) {
    return (
      <div className="modal-overlay">
        <div className="modal-content p-6 space-y-4">
          <h2 className="text-lg font-bold text-primary">
            {confirmDialog.title}
          </h2>
          <p className="text-sm text-secondary">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={confirmDialog.onCancel}
              className="btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={confirmDialog.onConfirm}
              className="btn-danger btn-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Templates</h1>
          <p className="page-subtitle">
            Reusable templates with dynamic variables
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({
              name: "",
              subject: "",
              body: "",
              type: "Job Application",
            })
          }
          className="btn-primary"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Template
        </button>
      </div>

      {/* Variable Reference */}
      <div className="card p-3">
        <p className="text-xs text-muted">
          <span className="font-semibold text-secondary">Variables:</span>{" "}
          {VARS.map((v, i) => (
            <span key={v}>
              <code className="bg-tertiary px-1.5 py-0.5 rounded text-accent font-mono text-[11px]">
                {v}
              </code>
              {i < VARS.length - 1 && " "}
            </span>
          ))}
        </p>
      </div>

      {/* Template Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-5 w-3/4 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
              <div className="skeleton h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState title="No templates yet. Create one to get started." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {templates.map((t) => {
            const vars = extractVariables(t.body);
            return (
              <div
                key={t._id}
                className="card card-hover p-5 space-y-3 flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-primary truncate">
                    {t.name}
                  </h3>
                  <span className="badge badge-neutral text-[10px] shrink-0">
                    {t.type}
                  </span>
                </div>

                <p className="text-xs text-muted truncate">{t.subject}</p>

                <p className="text-xs text-secondary line-clamp-2 flex-1">
                  {t.body}
                </p>

                {vars.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {vars.map((v) => (
                      <span
                        key={v}
                        className="badge badge-primary text-[10px] font-mono"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-2 border-t border-color">
                  <button
                    onClick={() => setEditing(t)}
                    className="btn-ghost btn-sm flex-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => duplicate(t._id)}
                    className="btn-ghost btn-sm flex-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(t._id, t.name)}
                    className="btn-ghost btn-sm text-danger hover:text-danger flex-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {editing && (
        <div
          className="modal-overlay"
          onClick={() => setEditing(null)}
        >
          <div
            className="modal-content p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-primary">
              {editing._id ? "Edit Template" : "Create Template"}
            </h2>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-secondary mb-1.5 block">
                  Template Name
                </label>
                <input
                  required
                  placeholder="e.g. Follow-up after interview"
                  className="input"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-secondary mb-1.5 block">
                  Type
                </label>
                <select
                  className="input"
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({ ...editing, type: e.target.value })
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-secondary mb-1.5 block">
                  Subject
                </label>
                <input
                  required
                  placeholder="Subject line (use {{variables}})"
                  className="input"
                  value={editing.subject}
                  onChange={(e) =>
                    setEditing({ ...editing, subject: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-secondary mb-1.5 block">
                  Body
                </label>
                <textarea
                  required
                  rows={8}
                  placeholder="Email body. Use {{candidateName}}, {{companyName}}, {{jobTitle}}, etc."
                  className="input"
                  value={editing.body}
                  onChange={(e) =>
                    setEditing({ ...editing, body: e.target.value })
                  }
                />
                {editing.body && extractVariables(editing.body).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {extractVariables(editing.body).map((v) => (
                      <span
                        key={v}
                        className="badge badge-primary text-[10px] font-mono"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-color">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  className="btn-primary btn-sm"
                >
                  {busy ? "Saving..." : editing._id ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
