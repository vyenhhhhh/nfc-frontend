// materialTheme.js
// Material Dashboard (Creative Tim) look with a light orange palette.
// Load AFTER internCss and formalLayout so it wins.
export const mdCss = `
/* font: Poppins, loaded by DashKit (uiUnify) */

:root {
  --md-text: #344767;
  --md-muted: #7b809a;
  --md-line: #f0f2f5;
  --md-shadow: 0 4px 20px 0 rgba(0,0,0,.08), 0 7px 10px -5px rgba(232,88,42,.10);
  --md-orange: linear-gradient(195deg, #ff9a5c, #e8582a);
}

/* ═════════ BASE ═════════ */
.ix-main { background: #fdf4ee; }
.ix-main, .ix-content, .ix-content button, .ix-content input,
.ix-content select, .ix-content textarea {
  font-family: "Roboto", "Helvetica", "Arial", sans-serif;
}
.ix-content { color: var(--md-text); }

/* cards */
.ix-card, .at-chart, .hv-hero, .hv-stat, .os-card, .at-log {
  border: 0;
  border-radius: 12px;
  background: var(--ix-surface, #fff);
  box-shadow: var(--md-shadow);
}

/* ═════════ HERO → white card ═════════ */
.hv-hero { color: var(--md-text); padding: 18px 24px; }
.hv-blob { display: none; }
.hv-hero h1 { color: var(--md-text) !important; font-size: 22px; font-weight: 700; }
.hv-hero p { color: var(--md-muted); }
.hv-pill { background: #fff1e8; color: #c2410c; backdrop-filter: none; border-radius: 8px; font-weight: 500; }
.hv-pill i { background: #e8582a; opacity: 1; }
.hv-pill.live { background: #e8f6ea; color: #2e7d32; }
.hv-pill.live i { background: #43a047; }
.hv-pill.warn { background: #fff4d6; color: #9a5b00; }
.hv-track { background: #fde5d8; }
.hv-track-fill { background: var(--md-orange); }
.hv-track i { background: var(--ix-surface, #fff); }
.hv-track-cap, .at-marks { color: var(--md-muted); }
.hv-track-cap b { color: var(--md-text); }
.hv-hero .ix-ring-center strong { color: var(--md-text) !important; }
.hv-quick button { background: #fff1e8; color: #c2410c; border-radius: 8px; font-weight: 500; }
.hv-quick button:hover { background: #ffe4d3; box-shadow: none; transform: none; }
.hv-quick button:focus-visible { outline-color: #e8582a; }

/* ═════════ STAT CARDS → floating icon box (compact) ═════════ */
.hv-stats { margin-top: 14px; gap: 20px 12px; }
.at-mid .hv-stats { gap: 28px 14px; margin-top: 16px; }
.hv-stat {
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto auto auto;
  column-gap: 10px; align-items: start; padding: 4px 12px 6px;
}
.hv-stat-body { display: contents; }
.hv-stat-ic {
  grid-column: 1; grid-row: 1 / span 2; width: 38px; height: 38px; margin-top: -16px;
  border-radius: 9px; color: #fff;
  box-shadow: 0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(0,0,0,.25);
}
.hv-stat.orange .hv-stat-ic { background: var(--md-orange); color: #fff; }
.hv-stat.blue   .hv-stat-ic { background: linear-gradient(195deg, #49a3f1, #1a73e8); color: #fff; }
.hv-stat.green  .hv-stat-ic { background: linear-gradient(195deg, #66bb6a, #43a047); color: #fff; }
.hv-stat.purple .hv-stat-ic { background: linear-gradient(195deg, #ab47bc, #8e24aa); color: #fff; }
.hv-stat.red    .hv-stat-ic { background: linear-gradient(195deg, #ef5350, #e53935); color: #fff; }
.hv-stat.red.ok .hv-stat-ic { background: linear-gradient(195deg, #66bb6a, #43a047); color: #fff; }

.hv-stat-body small { grid-column: 2; grid-row: 1; text-align: right; font-size: 12px; font-weight: 300; color: var(--md-muted); line-height: 1.2; }
.hv-stat-body strong { grid-column: 2; grid-row: 2; text-align: right; font-size: 17px; font-weight: 700; color: var(--md-text); margin: 0; line-height: 1.15; }
.hv-stat-body em {
  grid-column: 1 / -1; grid-row: 3; margin-top: 4px; padding-top: 4px;
  border-top: 1px solid var(--md-line); font-size: 11px; color: var(--md-muted); line-height: 1.3;
  white-space: normal;
}
.hv-stat-bar { grid-column: 1 / -1; grid-row: 4; margin-top: 3px; height: 3px; background: #fde5d8; }
/* the row of stat cards never grows to fill the column (keeps the cards short) */
.adm-col > .hv-stats { flex: 0 0 auto; }
.hv-stats { align-content: start; }
.hv-stat { min-height: 0; height: auto; }
.hv-stat-bar i { background: var(--md-orange); }

/* ═════════ TABLES ═════════ */
.ix-content thead th {
  text-transform: uppercase; font-size: 11px; font-weight: 700; letter-spacing: .5px;
  color: var(--md-muted); background: transparent; border-bottom: 1px solid var(--md-line);
}
.ix-content tbody td { font-size: 13px; color: var(--md-text); border-bottom: 1px solid var(--md-line); }
.ix-content tbody td:first-child { font-weight: 500; color: var(--md-text); }
.ix-content tbody tr:hover { background: #fffaf6; }

/* ═════════ BUTTONS / INPUTS / PILLS ═════════ */
.ix-btn, .ix-b.primary {
  background: var(--md-orange); border-radius: 8px; text-transform: uppercase;
  font-size: 12px; font-weight: 700; letter-spacing: .5px;
  box-shadow: 0 3px 3px 0 rgba(232,88,42,.15), 0 3px 1px -2px rgba(232,88,42,.2), 0 1px 5px 0 rgba(232,88,42,.15);
}
.ix-btn:hover:not(:disabled), .ix-b.primary:hover { transform: none; box-shadow: 0 14px 26px -12px rgba(232,88,42,.45); }
.ix-field input, .ix-field textarea, .ix-field select, .dtr-sel, .at-month { border-radius: 8px; border-color: #d2d6da; }
.ix-field input:focus, .ix-field textarea:focus, .ix-field select:focus { border-color: #e8582a; box-shadow: 0 0 0 2px rgba(232,88,42,.15); outline: 0; }
.ix-content .ix-pill, .ix-content .at-log-head .ix-pill { border-radius: 8px; }
.ix-content .ix-pill.active, .ix-content .at-log-head .ix-pill.active { background: var(--md-orange); box-shadow: none; }
.dtr-sel, .at-month { border-radius: 8px; }
.req-tabs { border-radius: 12px; background: var(--ix-surface, #fff); box-shadow: var(--md-shadow); }
.req-tabs button { border-radius: 8px; color: var(--md-muted); }
.req-tabs button.on { background: var(--md-orange); color: #fff; box-shadow: none; }
.req-item { border-radius: 8px; border-color: var(--md-line); }
.os-count { border-radius: 8px; }
.os-status { border-radius: 6px; }

/* ═════════ HOME: calendar / announcements / recent attendance → clean cards ═════════ */
.adm-col > :not(.hv-hero):not(.hv-stats):not(.ix-alert) {
  border: 0 !important; border-radius: 12px; background: var(--ix-surface, #fff);
  box-shadow: var(--md-shadow); overflow: hidden;
}
/* the section inside "recent attendance" must not draw a second border/shadow */
.adm-live > * { border: 0 !important; box-shadow: none !important; background: transparent !important; border-radius: 0; }
.adm-live { overflow: visible; }
.adm-live td, .adm-live th { padding-top: 10px; padding-bottom: 10px; }

/* ═════════ MY ATTENDANCE: smaller hero + stat cards ═════════ */
.hv-hero.compact { padding: 10px 18px; gap: 14px; }
.hv-hero.compact h1 { font-size: 17px; margin: 5px 0 1px; }
.hv-hero.compact p { font-size: 12px; margin: 0 0 8px; }
.hv-hero.compact .hv-pill { padding: 3px 10px; font-size: 11px; }
.hv-hero.compact .hv-track { height: 6px; }
.hv-hero.compact .at-marks { margin-top: 4px; font-size: 10px; }
.hv-hero.compact .ix-ring-center strong { font-size: 13px; }

.at-mid { grid-template-columns: 1fr; gap: 0; }
.at-mid .hv-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px 12px; margin-top: 12px; }
.at-mid .hv-stat { padding: 6px 12px 8px; column-gap: 10px; }
.at-mid .hv-stat-ic { width: 40px; height: 40px; margin-top: -18px; border-radius: 10px; }
.at-mid .hv-stat-body small { font-size: 12px; }
.at-mid .hv-stat-body strong { font-size: 17px; }
.at-mid .hv-stat-body em { margin-top: 6px; padding-top: 5px; font-size: 11.5px; }
@media (max-width: 900px) { .at-mid .hv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

/* ═════════ MY ATTENDANCE: tighter spacing + slim progress card ═════════ */
.at-stack { gap: 10px; }
.at-stack > :first-child { margin-bottom: 0 !important; padding-bottom: 8px; }
.hv-hero.compact { padding: 8px 16px; gap: 12px; border-radius: 10px; }
.hv-hero.compact p { display: none; }
.hv-hero.compact h1 { font-size: 15px; margin: 4px 0 6px; }
.hv-hero.compact .hv-pill { padding: 2px 9px; font-size: 10.5px; }
.hv-hero.compact .hv-track { height: 5px; }
.hv-hero.compact .ix-ring-center strong { font-size: 11px; }
.hv-hero.compact .at-marks { display: block; position: relative; height: 14px; margin-top: 4px; font-size: 10.5px; color: var(--md-muted); }
.hv-hero.compact .at-marks span { position: absolute; top: 0; transform: translateX(-50%); }
.hv-hero.compact .at-marks span:last-child { transform: translateX(-100%); }
`;