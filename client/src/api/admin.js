import api from "./axios.js";

export const listUsers = () => api.get("/admin/users").then((r) => r.data);
export const disableUser = (id, reason) =>
  api.patch(`/admin/users/${id}/disable`, { reason }).then((r) => r.data);
export const enableUser = (id) =>
  api.patch(`/admin/users/${id}/enable`).then((r) => r.data);
export const deleteUser = (id) => api.delete(`/admin/users/${id}`).then((r) => r.data);
export const runAutoFollowUp = () => api.post("/cron/run-auto-followup").then((r) => r.data);
