import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Feature switches: when the admin turns a feature off for this user the API
// answers 403 with { featureDisabled }. Announce it globally so a single popup
// can tell the user to contact support.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    if (error.response?.status === 403 && (data?.featureDisabled || data?.disabled)) {
      window.dispatchEvent(
        new CustomEvent("feature-disabled", {
          detail: {
            message: data.message,
            feature: data.featureDisabled,
            disabled: Boolean(data.disabled),
          },
        })
      );
    }
    return Promise.reject(error);
  }
);

export default api;
