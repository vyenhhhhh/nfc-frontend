// config.js
// ONE place for the server address. Set it in the React .env file:
//   VITE_API_URL=http://localhost:8000
// Restart `npm run dev` after changing .env.
export const SERVER = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const API = `${SERVER}/api`;
export const STORAGE = `${SERVER}/storage/`;