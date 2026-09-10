import api from "./axios.js";

export const listContacts = (params) => api.get("/contacts", { params }).then((r) => r.data);
export const getContact = (id) => api.get(`/contacts/${id}`).then((r) => r.data);
export const createContact = (data) => api.post("/contacts", data).then((r) => r.data);
export const updateContact = (id, data) => api.put(`/contacts/${id}`, data).then((r) => r.data);
export const deleteContact = (id) => api.delete(`/contacts/${id}`).then((r) => r.data);
