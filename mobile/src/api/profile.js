import api from "./axios.js";

export const getProfile = () => api.get("/profile").then((r) => r.data);
export const updateProfile = (data) => api.put("/profile", data).then((r) => r.data);
export const parseResume = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/profile/parse-resume", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
};
export const parseCloudinaryResume = (cloudinaryUrl, cloudinaryPublicId) =>
  api.post("/profile/parse-cloudinary-resume", { cloudinaryUrl, cloudinaryPublicId }).then((r) => r.data);
