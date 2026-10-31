const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://edupath-ej0c.onrender.com";

export const buildApiUrl = (path = "") => {
  const base = API_BASE_URL.replace(/\/+$/, "");

  const endpoint = String(path).replace(/^\/+/, "");

  return `${base}/${endpoint}`;
};