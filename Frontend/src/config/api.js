const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export const buildApiUrl = (path = "") => {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const endpoint = String(path).replace(/^\/+/, "");

  return `${base}/${endpoint}`;
};