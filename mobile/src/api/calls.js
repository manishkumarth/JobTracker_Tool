import api from "./axios.js";

export const listCalls = (params) => api.get("/calls", { params }).then((r) => r.data);
export const createCall = (data) => api.post("/calls", data).then((r) => r.data);
export const updateCall = (id, data) => api.put(`/calls/${id}`, data).then((r) => r.data);
export const deleteCall = (id) => api.delete(`/calls/${id}`).then((r) => r.data);
