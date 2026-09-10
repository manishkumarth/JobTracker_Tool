import api from "./axios.js";

export const listEmails = (params) => api.get("/emails", { params }).then((r) => r.data);
export const getEmail = (id) => api.get(`/emails/${id}`).then((r) => r.data);
export const getEmailTrackingStats = (id) => api.get(`/tracking/stats/${id}`).then((r) => r.data);
export const getEmailThread = (id) => api.get(`/mail/thread/${id}`).then((r) => r.data);
export const replyToEmail = (payload) => api.post("/mail/reply", payload).then((r) => r.data);
export const uploadAttachment = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/mail/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
};
export const sendMail = (payload) => api.post("/mail/send", payload).then((r) => r.data);
