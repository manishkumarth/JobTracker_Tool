import api from "./axios.js";

export const listTemplates = () => api.get("/templates").then((r) => r.data);
export const createTemplate = (data) => api.post("/templates", data).then((r) => r.data);
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data).then((r) => r.data);
export const duplicateTemplate = (id) => api.post(`/templates/${id}/duplicate`).then((r) => r.data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`).then((r) => r.data);
