import api from "./axios.js";

export const listApplications = (params) => api.get("/applications", { params }).then((r) => r.data);
export const getApplication = (id) => api.get(`/applications/${id}`).then((r) => r.data);
export const createApplication = (data) => api.post("/applications", data).then((r) => r.data);
export const updateApplication = (id, data) => api.put(`/applications/${id}`, data).then((r) => r.data);
export const deleteApplication = (id) => api.delete(`/applications/${id}`).then((r) => r.data);
export const changeStatus = (id, status) => api.patch(`/applications/${id}/status`, { status }).then((r) => r.data);
export const addNote = (id, text) => api.post(`/applications/${id}/notes`, { text }).then((r) => r.data);
export const computeMatchScore = (id) => api.post(`/applications/${id}/match-score`).then((r) => r.data);
export const bulkUpdateStatus = (ids, status) => api.post("/applications/bulk/status", { ids, status }).then((r) => r.data);
export const bulkScheduleFollowUp = (ids, date, type, note) => api.post("/applications/bulk/followup", { ids, date, type, note }).then((r) => r.data);
export const bulkDeleteApplications = (ids) => api.post("/applications/bulk/delete", { ids }).then((r) => r.data);

export const APPLICATION_STATUSES = [
  "NEW", "SAVED", "APPLYING", "APPLIED", "EMAIL_SENT",
  "FOLLOW_UP_REQUIRED", "FOLLOW_UP_SENT", "RECRUITER_REPLIED",
  "SCREENING", "PHONE_SCREEN", "INTERVIEW_SCHEDULED",
  "INTERVIEW_1", "INTERVIEW_2", "TECHNICAL_INTERVIEW", "HR_INTERVIEW",
  "ASSESSMENT", "OFFER", "SELECTED", "REJECTED", "WITHDRAWN",
  "NO_RESPONSE", "CLOSED",
];
