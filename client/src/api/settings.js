import api from "./axios.js";

export const getProviders = () => api.get("/settings/providers").then((r) => r.data);
export const saveProvider = (data) => api.put("/settings/providers", data).then((r) => r.data);
export const deleteProvider = (provider) => api.delete(`/settings/providers/${provider}`).then((r) => r.data);
export const activateProvider = (provider) => api.post(`/settings/providers/${provider}/activate`).then((r) => r.data);
export const testProvider = (provider, apiKey) => api.post("/settings/providers/test", { provider, apiKey }).then((r) => r.data);
