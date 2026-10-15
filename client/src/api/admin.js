import api from "./axios.js";

export const listUsers = () => api.get("/admin/users").then((r) => r.data);
export const disableUser = (id, reason) =>
  api.patch(`/admin/users/${id}/disable`, { reason }).then((r) => r.data);
export const enableUser = (id) =>
  api.patch(`/admin/users/${id}/enable`).then((r) => r.data);
export const deleteUser = (id) => api.delete(`/admin/users/${id}`).then((r) => r.data);

// Per-user feature switches
export const setUserFeature = (id, feature, value) =>
  api.patch(`/admin/users/${id}/features`, { feature, value }).then((r) => r.data);
export const disableAllFeatures = (id) =>
  api.patch(`/admin/users/${id}/disable-all-features`).then((r) => r.data);
export const enableAllFeatures = (id) =>
  api.patch(`/admin/users/${id}/enable-all-features`).then((r) => r.data);

// Admin-configurable Gmail setup video
export const getAppVideo = () => api.get("/admin/app-video").then((r) => r.data);
export const saveAppVideo = (url) => api.put("/admin/app-video", { url }).then((r) => r.data);
