import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getProfile, updateProfile, parseCloudinaryResume } from "../api/profile.js";
import { listResumes, uploadResume, setDefaultResume, deleteResume } from "../api/resumes.js";

const arrToStr = (arr) => (arr || []).join(", ");
const strToArr = (str) => str.split(",").map((s) => s.trim()).filter(Boolean);

function ResumeItem({ resume, parsingId, onParse, onSetDefault, onDelete }) {
  const isParsing = parsingId === resume._id;
  return (
    <div className="flex items-center gap-3 p-3 bg-tertiary rounded-lg">
      <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-primary truncate">{resume.originalName}</p>
        <p className="text-xs text-muted">
          {(resume.size / 1024).toFixed(1)} KB &middot; {new Date(resume.uploadedAt).toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {resume.isDefault ? (
          <span className="badge badge-success">Default</span>
        ) : (
          <button onClick={() => onSetDefault(resume._id)} className="btn btn-sm btn-secondary">
            Set default
          </button>
        )}
        <button
          onClick={() => onParse(resume)}
          disabled={isParsing}
          className="btn btn-sm btn-warning"
          title="Parse this resume to auto-fill profile"
        >
          {isParsing ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          )}
          {isParsing ? "Parsing..." : "Parse"}
        </button>
        <button
          onClick={() => onDelete(resume._id)}
          className="btn btn-sm btn-icon text-danger"
          title="Delete resume"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function CandidateProfilePage() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [parsingResumeId, setParsingResumeId] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showParseResult, setShowParseResult] = useState(true);

  useEffect(() => {
    getProfile()
      .then((p) =>
        setForm({
          name: p.name || "",
          professionalTitle: p.professionalTitle || "",
          experience: p.experience || "",
          skills: arrToStr(p.skills),
          technologies: arrToStr(p.technologies),
          previousCompanies: arrToStr(p.previousCompanies),
          projects: arrToStr(p.projects),
          education: p.education || "",
          portfolio: p.portfolio || "",
          github: p.github || "",
          linkedin: p.linkedin || "",
          resumeText: p.resumeText || "",
          additionalInfo: p.additionalInfo || "",
        })
      )
      .catch(() => toast.error("Failed to load profile"));
  }, []);

  useEffect(() => {
    listResumes()
      .then((d) => { setResumes(d.resumes || []); setResumesLoading(false); })
      .catch(() => setResumesLoading(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({
        ...form,
        skills: strToArr(form.skills),
        technologies: strToArr(form.technologies),
        previousCompanies: strToArr(form.previousCompanies),
        projects: strToArr(form.projects),
      });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save profile");
    } finally {
      setBusy(false);
    }
  };

  const handleParseFromCloudinary = async (resume) => {
    setParsingResumeId(resume._id);
    setParseResult(null);
    setShowParseResult(true);
    try {
      const parsed = await parseCloudinaryResume(resume.cloudinaryUrl, resume.cloudinaryPublicId);
      setParseResult(parsed);
      toast.success("Resume parsed! Review and apply below.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to parse resume");
    } finally {
      setParsingResumeId(null);
    }
  };

  const applyParsedData = () => {
    if (!parseResult) return;
    setForm((prev) => ({
      ...prev,
      skills: arrToStr([...new Set([...strToArr(prev.skills), ...parseResult.skills])]),
      technologies: arrToStr([...new Set([...strToArr(prev.technologies), ...parseResult.skills])]),
      experience: parseResult.experience || prev.experience,
      professionalTitle: parseResult.professionalTitle || prev.professionalTitle,
      education: parseResult.education || prev.education,
      projects: arrToStr([...new Set([...strToArr(prev.projects), ...parseResult.projects.split("; ").filter(Boolean)])]),
    }));
    setParseResult(null);
    toast.success("Parsed data applied! Click Save to persist.");
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    setUploading(true);
    try {
      const { resume } = await uploadResume(file);
      setResumes((prev) => [...prev, resume]);
      toast.success("Resume uploaded to Cloudinary");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to upload resume");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSetDefault = async (resumeId) => {
    try {
      await setDefaultResume(resumeId);
      setResumes((prev) => prev.map((r) => ({ ...r, isDefault: r._id === resumeId })));
      toast.success("Default resume updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to set default");
    }
  };

  const handleDeleteResume = async (resumeId) => {
    if (!window.confirm("Delete this resume? This cannot be undone.")) return;
    try {
      await deleteResume(resumeId);
      setResumes((prev) => prev.filter((r) => r._id !== resumeId));
      toast.success("Resume deleted");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete resume");
    }
  };

  if (!form) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Candidate Profile</h1>
            <p className="page-subtitle">Loading your profile...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-6"><div className="skeleton h-10 w-full rounded-lg" /></div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="card p-6"><div className="skeleton h-32 w-full rounded-lg" /></div>
          </div>
        </div>
      </div>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Candidate Profile</h1>
          <p className="page-subtitle">This is what the AI email assistant uses to personalize your emails. Only what you list here will ever be claimed on your behalf.</p>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Profile form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="section-title">Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Full name</label>
                  <input placeholder="Jane Doe" className="input" value={form.name} onChange={set("name")} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Professional title</label>
                  <input placeholder="Frontend Developer" className="input" value={form.professionalTitle} onChange={set("professionalTitle")} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Experience</label>
                <input placeholder="e.g. 2 years" className="input" value={form.experience} onChange={set("experience")} />
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="section-title">Skills & Technologies</h2>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Skills (comma-separated)</label>
                <input placeholder="React, TypeScript, Node.js" className="input" value={form.skills} onChange={set("skills")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Technologies (comma-separated)</label>
                <input placeholder="AWS, Docker, PostgreSQL" className="input" value={form.technologies} onChange={set("technologies")} />
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="section-title">Experience & Education</h2>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Previous companies (comma-separated)</label>
                <input placeholder="Google, Meta, Stripe" className="input" value={form.previousCompanies} onChange={set("previousCompanies")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Projects (comma-separated)</label>
                <input placeholder="E-commerce platform, AI chatbot" className="input" value={form.projects} onChange={set("projects")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Education</label>
                <input placeholder="B.S. Computer Science, MIT" className="input" value={form.education} onChange={set("education")} />
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="section-title">Links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Portfolio URL</label>
                  <input placeholder="https://..." className="input" value={form.portfolio} onChange={set("portfolio")} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">GitHub URL</label>
                  <input placeholder="https://github.com/..." className="input" value={form.github} onChange={set("github")} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">LinkedIn URL</label>
                  <input placeholder="https://linkedin.com/..." className="input" value={form.linkedin} onChange={set("linkedin")} />
                </div>
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="section-title">Additional Information</h2>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Resume summary (optional plain-text summary)</label>
                <textarea placeholder="Brief summary of your experience and career goals..." rows={4} className="input" value={form.resumeText} onChange={set("resumeText")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Additional information</label>
                <textarea placeholder="Any other information you'd like to include..." rows={2} className="input" value={form.additionalInfo} onChange={set("additionalInfo")} />
              </div>
            </div>
          </div>

          {/* Right column - Resumes & parse */}
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="section-title">Resumes</h2>

              {resumesLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-4 w-32 rounded" />
                        <div className="skeleton h-3 w-24 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {resumes.map((r) => (
                    <ResumeItem
                      key={r._id}
                      resume={r}
                      parsingId={parsingResumeId}
                      onParse={handleParseFromCloudinary}
                      onSetDefault={handleSetDefault}
                      onDelete={handleDeleteResume}
                    />
                  ))}
                </div>
              )}

              <hr className="divider" />

              <label className="cursor-pointer block">
                <input type="file" accept=".pdf" onChange={handleResumeUpload} className="sr-only" disabled={uploading} />
                <div className="flex items-center justify-center py-6 border-2 border-dashed border-color rounded-lg hover:border-brand-400 hover:bg-tertiary transition-colors">
                  <div className="text-center">
                    {uploading ? (
                      <svg className="mx-auto h-8 w-8 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="mx-auto h-8 w-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                    <p className="mt-2 text-sm text-secondary">{uploading ? "Uploading..." : "Add more resumes"}</p>
                    <p className="text-xs text-muted">PDF only, stored on Cloudinary</p>
                  </div>
                </div>
              </label>
            </div>

            {parseResult && (
              <div className="card overflow-hidden animate-slide-up">
                <div className="bg-success-light border-b border-success/20 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="font-semibold text-success text-sm">Parsed Resume Data</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowParseResult((v) => !v)}
                    className="btn btn-sm btn-ghost text-success"
                  >
                    {showParseResult ? "Hide" : "Show"}
                  </button>
                </div>

                {showParseResult && (
                  <div className="p-6 space-y-3">
                    <p className="text-xs text-muted">Review before applying to your profile</p>
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      {parseResult.professionalTitle && (
                        <div className="flex gap-2">
                          <span className="font-medium text-primary shrink-0">Title:</span>
                          <span className="text-secondary">{parseResult.professionalTitle}</span>
                        </div>
                      )}
                      {parseResult.experience && (
                        <div className="flex gap-2">
                          <span className="font-medium text-primary shrink-0">Experience:</span>
                          <span className="text-secondary">{parseResult.experience}</span>
                        </div>
                      )}
                      {parseResult.skills?.length > 0 && (
                        <div className="flex gap-2">
                          <span className="font-medium text-primary shrink-0">Skills:</span>
                          <span className="text-secondary">
                            {parseResult.skills.slice(0, 10).join(", ")}
                            {parseResult.skills.length > 10 && ` (+${parseResult.skills.length - 10} more)`}
                          </span>
                        </div>
                      )}
                      {parseResult.education && (
                        <div className="flex gap-2">
                          <span className="font-medium text-primary shrink-0">Education:</span>
                          <span className="text-secondary">{parseResult.education}</span>
                        </div>
                      )}
                      {parseResult.projects && (
                        <div className="flex gap-2">
                          <span className="font-medium text-primary shrink-0">Projects:</span>
                          <span className="text-secondary">{parseResult.projects}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={applyParsedData} className="btn btn-sm btn-success">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Apply to profile
                      </button>
                      <button type="button" onClick={() => setParseResult(null)} className="btn btn-sm btn-ghost text-muted">
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Save profile
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
