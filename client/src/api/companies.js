import api from "./axios.js";

export const listCompanies = (params) => api.get("/companies", { params }).then((r) => r.data);
export const getCompany = (id) => api.get(`/companies/${id}`).then((r) => r.data);
export const createCompany = (data) => api.post("/companies", data).then((r) => r.data);
export const updateCompany = (id, data) => api.put(`/companies/${id}`, data).then((r) => r.data);
export const deleteCompany = (id) => api.delete(`/companies/${id}`).then((r) => r.data);
