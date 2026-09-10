import api from "./axios.js";

export const listResumes = () => api.get("/resumes").then((r) => r.data);
export const uploadResume = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/resumes/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
};
export const setDefaultResume = (resumeId) => api.patch(`/resumes/${resumeId}/default`).then((r) => r.data);
export const deleteResume = (resumeId) => api.delete(`/resumes/${resumeId}`).then((r) => r.data);