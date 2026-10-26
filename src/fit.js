// fit.js
// Makes every page look the same on every laptop.
//
// Windows "Display scale" (Settings > System > Display) changes how big a web page is drawn:
//   1920x1080 at 125%  -> the browser has about 1536 x 740 to work with   (the size the design was made for)
//   1920x1080 at 150%  -> about 1280 x 620  -> cards look bigger and the page needs extra scrolling
//   1366x768  at 100%  -> about 1366 x 650
// This shrinks the whole page a little on smaller screens so it keeps the same proportions
// (never bigger than the design, never below 72%). Phones keep their own mobile layout.
export const DESIGN_WIDTH = 1536;
export const DESIGN_HEIGHT = 740;
const MIN_FIT = 0.72;

export function currentFit() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fit"));
  return v > 0 ? v : 1;
}

export function applyFit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fit = w < 900 ? 1 : Math.max(MIN_FIT, Math.min(1, w / DESIGN_WIDTH, h / DESIGN_HEIGHT));
  const r = Math.round(fit * 100) / 100;
  const root = document.documentElement;
  root.style.zoom = r === 1 ? "" : String(r);
  root.style.setProperty("--fit", String(r));   // CSS uses it to keep full-height pages full height
}

applyFit();
window.addEventListener("resize", applyFit);