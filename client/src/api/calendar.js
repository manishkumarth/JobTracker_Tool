import api from "./axios.js";

export const exportCalendarICS = (type = "all") => {
  const params = new URLSearchParams();
  if (type !== "all") params.append("type", type);
  return api.get(`/calendar/ics?${params.toString()}`, { responseType: "blob" }).then((r) => r.data);
};

export const exportApplicationCalendarICS = (applicationId) =>
  api.get(`/calendar/ics/application/${applicationId}`, { responseType: "blob" }).then((r) => r.data);