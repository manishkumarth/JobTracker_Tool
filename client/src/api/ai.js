import api from "./axios.js";

export const generateEmail = (payload) => api.post("/ai/generate-email", payload).then((r) => r.data);
export const generateFollowUpEmail = (applicationId) => api.post("/ai/generate-followup", { applicationId }).then((r) => r.data);
export const refineEmail = (payload) => api.post("/ai/refine", payload).then((r) => r.data);
export const analyzeJob = (jobDescription) => api.post("/ai/analyze-job", { jobDescription }).then((r) => r.data);
export const parseLinkedIn = (text) => api.post("/ai/parse-linkedin", { text }).then((r) => r.data);
