import api from "./axios.js";

export const listInterviews = (params) => api.get("/interviews", { params }).then((r) => r.data);
export const createInterview = (data) => api.post("/interviews", data).then((r) => r.data);
export const updateInterview = (id, data) => api.put(`/interviews/${id}`, data).then((r) => r.data);
export const deleteInterview = (id) => api.delete(`/interviews/${id}`).then((r) => r.data);
