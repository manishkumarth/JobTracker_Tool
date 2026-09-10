import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createApplication } from "../api/applications.js";
import { listCompanies, createCompany } from "../api/companies.js";
import { listContacts, createContact } from "../api/contacts.js";
import { parseLinkedIn } from "../api/ai.js";

const JOB_SOURCES = ["Naukri", "LinkedIn", "Indeed", "Company Website", "Referral", "Recruiter", "Email", "Other"];
const WORK_MODES = ["Remote", "Hybrid", "On-site"];
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export default function ApplicationFormModal({ onClose, onSaved }) {
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [linkedinText, setLinkedinText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [form, setForm] = useState({
    companyName: "", company: "", jobTitle: "", jobDescription: "", jobUrl: "",
    jobSource: "LinkedIn", location: "", workMode: "On-site", employmentType: "Full-time",
    salary: "", experienceRequired: "", requiredSkills: "",
    contact: "", hrName: "", hrEmail: "", hrPhone: "",
    priority: "Medium", notes: "",
  });

  useEffect(() => {
    listCompanies({ limit: 100 }).then((d) => setCompanies(d.companies)).catch(() => {});
    listContacts().then((d) => setContacts(Array.isArray(d) ? d : d.contacts || [])).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let companyId = form.company || null;
      // If they typed a new company name that doesn't match an existing one, create it
      if (!companyId && form.companyName) {
        const match = companies.find((c) => c.name.toLowerCase() === form.companyName.toLowerCase());
        if (match) companyId = match._id;
        else {
          const created = await createCompany({ name: form.companyName });
          companyId = created._id;
        }
      }

      let contactId = form.contact || null;
      // If "create new contact" is selected and HR email is provided, create the contact first
      if (newContact && form.hrEmail) {
        try {
          const created = await createContact({
            name: form.hrName,
            email: form.hrEmail,
            phone: form.hrPhone,
            contactType: "HR",
          });
          contactId = created._id;
          toast.success("Contact created and linked");
        } catch (err) {
          const msg = err.response?.data?.message || "Failed to create contact";
          toast.error(msg);
          setBusy(false);
          return; // Don't save application if contact creation fails
        }
      }

      await createApplication({
        ...form,
        company: companyId,
        contact: contactId,
        requiredSkills: form.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean),
        notes: undefined,
      });
      toast.success("Application added");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add application");
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleParseLinkedIn = async () => {
    if (!linkedinText.trim()) return toast.error("Paste LinkedIn text first");
    setParsing(true);
    try {
      const data = await parseLinkedIn(linkedinText);
      const filled = [];
      const merge = (key, value) => {
        if (value && String(value).trim()) {
          setForm((prev) => ({ ...prev, [key]: value }));
          filled.push(key);
        }
      };

      merge("jobTitle", data.jobTitle);
      merge("companyName", data.companyName);
      merge("jobDescription", data.jobDescription);
      merge("location", data.location);
      merge("experienceRequired", data.experienceRequired);
      merge("salary", data.salary);
      merge("hrName", data.hrName);
      merge("hrEmail", data.hrEmail);
      merge("hrPhone", data.hrPhone);

      if (data.workMode && ["Remote", "Hybrid", "On-site"].includes(data.workMode)) {
        merge("workMode", data.workMode);
      }
      if (data.employmentType && ["Full-time", "Part-time", "Contract", "Internship"].includes(data.employmentType)) {
        merge("employmentType", data.employmentType);
      }
      if (data.requiredSkills?.length) {
        merge("requiredSkills", data.requiredSkills.join(", "));
      }

      toast.success(`Extracted ${filled.length} field${filled.length > 1 ? "s" : ""} from LinkedIn`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to parse LinkedIn text");
    } finally {
      setParsing(false);
    }
  };

  const inputClass = "border border-color rounded-lg px-3 py-2 text-sm input-bg text-primary";
  const selectClass = "border border-color rounded-lg px-3 py-2 text-sm input-bg text-primary";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 px-4 py-8 overflow-y-auto">
      <form onSubmit={submit} className="bg-secondary rounded-2xl p-6 w-full max-w-2xl space-y-3 shadow-xl my-auto border border-color">
        <h2 className="text-lg font-bold text-brand-700 dark:text-brand-300">Add application</h2>

        <div className="border border-color rounded-lg overflow-hidden">
          <button type="button" onClick={() => setLinkedinOpen(!linkedinOpen)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-primary hover:bg-tertiary transition-colors">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Quick Fill from LinkedIn
            </span>
            <svg className={`w-4 h-4 transition-transform ${linkedinOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {linkedinOpen && (
            <div className="px-4 pb-4 space-y-2">
              <textarea rows={4} placeholder="Paste LinkedIn job posting, recruiter profile, or any LinkedIn text here..." className={`w-full ${inputClass}`} value={linkedinText} onChange={(e) => setLinkedinText(e.target.value)} />
              <button type="button" disabled={parsing || !linkedinText.trim()} onClick={handleParseLinkedIn} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-2">
                {parsing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Extracting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Extract with AI
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input required placeholder="Job title *" className={inputClass} value={form.jobTitle} onChange={set("jobTitle")} />
          <input
            placeholder="Company name *"
            list="company-list"
            className={inputClass}
            value={form.companyName}
            onChange={(e) => {
              const match = companies.find((c) => c.name === e.target.value);
              setForm({ ...form, companyName: e.target.value, company: match?._id || "" });
            }}
          />
          <datalist id="company-list">
            {companies.map((c) => <option key={c._id} value={c.name} />)}
          </datalist>
        </div>

        <textarea placeholder="Job description (paste JD here for AI email generation later)" rows={3} className={`w-full ${inputClass}`} value={form.jobDescription} onChange={set("jobDescription")} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <input placeholder="Job URL" className={inputClass} value={form.jobUrl} onChange={set("jobUrl")} />
          <select className={selectClass} value={form.jobSource} onChange={set("jobSource")}>
            {JOB_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Location" className={inputClass} value={form.location} onChange={set("location")} />
          <select className={selectClass} value={form.workMode} onChange={set("workMode")}>
            {WORK_MODES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className={selectClass} value={form.employmentType} onChange={set("employmentType")}>
            {EMPLOYMENT_TYPES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className={selectClass} value={form.priority} onChange={set("priority")}>
            {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Salary" className={inputClass} value={form.salary} onChange={set("salary")} />
          <input placeholder="Experience required" className={inputClass} value={form.experienceRequired} onChange={set("experienceRequired")} />
        </div>

        <input placeholder="Required skills (comma-separated)" className={`w-full ${inputClass}`} value={form.requiredSkills} onChange={set("requiredSkills")} />

        <div className="border-t border-color pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted">HR / Recruiter contact</p>
            <button type="button" onClick={() => setNewContact(!newContact)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {newContact ? "Select existing" : "Create new"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {newContact ? (
              <>
                <input placeholder="Contact name" className={inputClass} value={form.hrName} onChange={set("hrName")} />
                <input required={newContact} placeholder="Contact email *" className={inputClass} value={form.hrEmail} onChange={set("hrEmail")} />
                <input placeholder="Contact phone" className={inputClass} value={form.hrPhone} onChange={set("hrPhone")} />
              </>
            ) : (
              <>
                <select className={`${selectClass} sm:col-span-2`} value={form.contact} onChange={(e) => {
                  const c = contacts.find((x) => x._id === e.target.value);
                  setForm({ ...form, contact: e.target.value, hrName: c?.name || form.hrName, hrEmail: c?.email || form.hrEmail, hrPhone: c?.phone || form.hrPhone });
                }}>
                  <option value="">Select existing contact (optional)</option>
                  {contacts.map((c) => <option key={c._id} value={c._id}>{c.name || c.email} — {c.email}</option>)}
                </select>
                <input placeholder="HR name" className={inputClass} value={form.hrName} onChange={set("hrName")} />
                <input placeholder="HR email" className={inputClass} value={form.hrEmail} onChange={set("hrEmail")} />
                <input placeholder="HR phone" className={inputClass} value={form.hrPhone} onChange={set("hrPhone")} />
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-tertiary hover:bg-gray-200 dark:hover:bg-gray-700 text-primary">Cancel</button>
          <button disabled={busy} className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save application"}
          </button>
        </div>
      </form>
    </div>
  );
}
