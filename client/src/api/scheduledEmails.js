import api from "./axios.js";

export const listScheduledEmails = (params) => api.get("/scheduled-emails", { params }).then((r) => r.data);
export const getScheduledEmailCounts = () => api.get("/scheduled-emails/counts").then((r) => r.data);
export const createScheduledEmail = (payload) => api.post("/scheduled-emails", payload).then((r) => r.data);
export const updateScheduledEmail = (id, payload) => api.put(`/scheduled-emails/${id}`, payload).then((r) => r.data);
export const cancelScheduledEmail = (id) => api.post(`/scheduled-emails/${id}/cancel`).then((r) => r.data);
export const retryScheduledEmail = (id) => api.post(`/scheduled-emails/${id}/retry`).then((r) => r.data);
export const sendScheduledEmailNow = (id) => api.post(`/scheduled-emails/${id}/send-now`).then((r) => r.data);
export const deleteScheduledEmail = (id) => api.delete(`/scheduled-emails/${id}`).then((r) => r.data);
export const runDueScheduledEmails = (limit = 20) =>
  api.post("/scheduled-emails/run-due", { limit }).then((r) => r.data);
