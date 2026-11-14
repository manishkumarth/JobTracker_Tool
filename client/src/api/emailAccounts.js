import api from "./axios.js";

export const listEmailAccounts = () => api.get("/email-accounts").then((r) => r.data);
export const addEmailAccount = (data) => api.post("/email-accounts", data).then((r) => r.data);
export const updateEmailAccount = (id, data) => api.put(`/email-accounts/${id}`, data).then((r) => r.data);
export const deleteEmailAccount = (id) => api.delete(`/email-accounts/${id}`).then((r) => r.data);
export const setDefaultEmailAccount = (id) => api.post(`/email-accounts/${id}/default`).then((r) => r.data);
export const testEmailAccount = (id) => api.post(`/email-accounts/${id}/test`).then((r) => r.data);
export const testEmailCredentials = (address, appPassword) =>
  api.post("/email-accounts/test", { address, appPassword }).then((r) => r.data);
