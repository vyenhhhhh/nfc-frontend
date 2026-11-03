// files.js
// Uploaded files and who may open them.
//
// Public files (profile photos, the blank requirement forms) are opened straight from storage.
// Private files (requirement uploads, signed evaluation forms, school-event proofs, staff signatures)
// are NOT reachable by a plain link: the page asks the server, the server checks who is asking,
// and answers with a link that only works for about 10 minutes.
import { useEffect, useState } from "react";
import { API, STORAGE } from "./config.js";

const PRIVATE = /^(movs|evaluations|excuse-proofs|signatures|work_mode)\//;
const clean = (p) => String(p || "").replace(/^\/+/, "");

export const isPrivateFile = (p) => PRIVATE.test(clean(p));

/** the link to open a file (asks the server for private files) */
export async function fileLink(path) {
  if (!path) return null;
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  const p = clean(path);
  if (!isPrivateFile(p)) return STORAGE + p;
  const res = await fetch(`${API}/files/link?path=${encodeURIComponent(p)}`, { headers: { Accept: "application/json" } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.message || "This file can't be opened.");
  return d.url;
}

/** for <a href>: public files keep their real link; private ones are opened with openFile() */
export const fileHref = (path) => (path && !isPrivateFile(path) ? STORAGE + clean(path) : "#");

/** opens a file in a new tab (use as onClick; the tab opens right away so the browser doesn't block it) */
export function openFile(path, e) {
  if (!isPrivateFile(path)) return;            // public: the normal link opens it
  e?.preventDefault?.();
  const w = window.open("", "_blank");
  if (w) {
    try { w.document.title = "Opening file…"; w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px;color:#555">Opening file…</p>'; } catch { /* ignore */ }
  }
  fileLink(path)
    .then((url) => { if (w) w.location.href = url; else window.location.href = url; })
    .catch((err) => {
      if (w) {
        try { w.document.body.innerHTML = `<p style="font-family:sans-serif;padding:24px;color:#b91c1c">${String(err.message || err).replace(/</g, "&lt;")}</p>`; } catch { w.close(); }
      }
    });
}

/** for <img src> and <iframe src>: the link, once the server has given it (null while waiting) */
export function useFileLink(path) {
  const [url, setUrl] = useState(() => (path && !isPrivateFile(path) ? (/^(https?:|blob:|data:)/.test(path) ? path : STORAGE + clean(path)) : null));
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return undefined; }
    fileLink(path).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [path]);
  return url;
}
