import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL = "https://j-tracker-tool.vercel.app/api"; // change to http://localhost:5000/api if local testing

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    if (error.response?.status === 403 && (data?.featureDisabled || data?.disabled)) {
      // emit via global event? but RN has no window; we'll handle in UI when needed
    }
    return Promise.reject(error);
  }
);

export default api;
