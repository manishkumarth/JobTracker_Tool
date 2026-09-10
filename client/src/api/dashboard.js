import api from "./axios.js";

export const getDashboardStats = () => api.get("/dashboard/stats").then((r) => r.data);
