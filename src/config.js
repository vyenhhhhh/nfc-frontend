// config.js
// ONE place for the server address. Set it in the React .env file:
//   VITE_API_URL=http://localhost:8000          (your laptop)
//   VITE_API_URL=http://192.168.1.20:8000       (the school server, for example)
// Restart `npm run dev` after changing .env.
export const SERVER = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const API = `${SERVER}/api`;
// Uploaded files (photos, MOVs, WFH letters). With Supabase Storage set:
//   VITE_STORAGE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/mytrack/
// Leave it out to use this laptop's /storage folder.
export const STORAGE = (import.meta.env.VITE_STORAGE_URL || `${SERVER}/storage`).replace(/\/+$/, "") + "/";