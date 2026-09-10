import api from "./axios.js";

export const listFollowUps = (params) => api.get("/followups", { params }).then((r) => r.data);
export const createFollowUp = (data) => api.post("/followups", data).then((r) => r.data);
export const updateFollowUp = (id, data) => api.put(`/followups/${id}`, data).then((r) => r.data);
export const completeFollowUp = (id) => api.patch(`/followups/${id}/complete`).then((r) => r.data);
export const cancelFollowUp = (id) => api.patch(`/followups/${id}/cancel`).then((r) => r.data);
export const deleteFollowUp = (id) => api.delete(`/followups/${id}`).then((r) => r.data);
