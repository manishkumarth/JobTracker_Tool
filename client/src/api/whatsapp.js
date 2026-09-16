import api from "./axios.js";

export const listWhatsAppMessages = (params) => api.get("/whatsapp", { params }).then((r) => r.data);
export const logWhatsAppMessage = (data) => api.post("/whatsapp", data).then((r) => r.data);
export const rewriteWhatsAppMessage = (data) => api.post("/whatsapp/rewrite", data).then((r) => r.data);
export const deleteWhatsAppMessage = (id) => api.delete(`/whatsapp/${id}`).then((r) => r.data);
