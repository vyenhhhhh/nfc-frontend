export const formalLayout = `
/* ═════ type: same fonts, calmer headings ═════ */
.ix-main { --display: 'Figtree', 'Segoe UI', sans-serif; }
.ix-content h1, .ix-content h2, .ix-content h3 { font-weight: 700; letter-spacing: 0; }

/* ═════ cards: square-ish corners, solid hairline border, no floating shadow ═════ */
.ix-main .ix-card, .ix-main .ix-section, .ix-main .ix-sub, .ix-main .ix-ic,
.ix-main .ix-hc, .ix-main .ix-stat, .ix-main .ix-doc,
.intern-home .intern-recent, .intern-home .intern-cal, .intern-home .intern-announce,
.ix-content .ix-card.adm-cal, .ix-content .ix-card.adm-duty, .ix-content .ix-card.crd-review {
  border-radius: 4px;
  border: 1px solid #ead9ce;
  box-shadow: none;
}
.ix-main .ix-card.adm-hero, .intern-home .ix-card.intern-profile {
  border-radius: 4px; border: 1px solid #7a2a12; box-shadow: none;
}

/* no hover "lift" anywhere */
.adm-mini:hover, .intern-mini:hover, .crd-row:hover, .ix-ic:hover, .ix-stat:hover,
.ix-btn:hover:not(:disabled) { transform: none; box-shadow: none; }

/* remove decoration (glow circles, grain, tint circles, live pulse) */
.adm-hero::before, .intern-profile::before, .adm-hero-glow, .intern-profile-glow,
.adm-mini::after, .intern-mini::after { display: none; }
.adm-live-dot, .intern-live { animation: none; }
.ix-content .adm-hero h1 { text-shadow: none; }

/* consistent spacing between blocks */
.adm-home, .adm-col { gap: 16px; }
.intern-home { --home-gap: 16px; --card-radius: 4px; }

/* ═════ hero / profile: compact header block with labeled fields ═════ */
.ix-content .ix-card.adm-hero { padding: 20px 24px; }
.intern-home .ix-card.intern-profile { padding: 20px 24px; gap: 18px 28px; }
.adm-hero-tag, .intern-role-pill { border-radius: 2px; backdrop-filter: none; -webkit-backdrop-filter: none; }
.ix-content .adm-hero h1 { font-size: clamp(22px, 2vw, 28px); margin-top: 10px; }
.adm-hero-facts { gap: 0; margin-top: 16px; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; width: fit-content; }
.adm-hero-facts > div { border: none; border-radius: 0; background: transparent; padding: 8px 18px; border-right: 1px solid rgba(255,255,255,0.25); }
.adm-hero-facts > div:last-child { border-right: none; }
.adm-hero-facts strong { font-size: 20px; }

.intern-pic-wrap { border-radius: 4px; box-shadow: 0 0 0 2px rgba(255,255,255,0.85); }
.intern-pic { border-radius: 4px; }
.intern-profile-pic svg { border-radius: 4px; background: #fff4ee; }
.intern-names { gap: 6px 32px; }
.intern-names .v { text-transform: none; font-weight: 700; letter-spacing: 0; font-size: clamp(16px, 1.3vw, 20px); }
.intern-names small, .intern-chip small { text-transform: uppercase; font-size: 10.5px; letter-spacing: .6px; }
.intern-contact { gap: 0; margin-top: 14px; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; width: fit-content; max-width: 100%; }
.intern-chip { border: none; border-radius: 0; background: transparent; border-right: 1px solid rgba(255,255,255,0.25); font-size: 13.5px; }
.intern-chip:last-child { border-right: none; }
.intern-milestone { border-radius: 2px; box-shadow: none; }

/* ═════ summary cards: one connected strip with divider lines ═════ */
.adm-stats, .intern-five-stats {
  gap: 1px; background: #ead9ce; border: 1px solid #ead9ce; border-radius: 4px; overflow: hidden;
}
.ix-main .adm-mini, .ix-main .intern-mini {
  border: none; border-radius: 0; box-shadow: none; padding: 14px 16px; background: #fff;
}
.adm-mini-icon, .intern-mini-icon, .crd-icon, .crd-row-ico, .adm-duty-icon,
.intern-announce-icon, .ix-stat-icon { border-radius: 4px; box-shadow: none !important; }
.adm-mini-value, .intern-mini-value { font-size: 26px; letter-spacing: 0; }
.adm-mini-bar, .adm-mini-bar i, .intern-mini-bar, .intern-mini-bar i { border-radius: 1px; }

/* ═════ section / card headers: titled band with a divider ═════ */
.ix-section > header, .intern-recent > header {
  padding: 12px 20px; border-bottom: 1px solid #ead9ce; background: #fffaf7;
}
.ix-section > header h2, .intern-recent > header h2 { font-size: 15px; }
.adm-duty-head, .crd-head, .intern-announce-head {
  margin: -20px -22px 14px; padding: 12px 20px; border-bottom: 1px solid #ead9ce; background: #fffaf7;
}
.adm-duty-head h2, .crd-head h2, .intern-announce h2 { font-size: 15px; }
.intern-announce-head { margin: -20px -24px 14px; }
.adm-duty-icon, .crd-icon, .intern-announce-icon { width: 30px; height: 30px; }

/* page titles get a rule underneath */
.ix-content .ix-ph { padding-bottom: 14px; border-bottom: 1px solid #ead9ce; margin-bottom: 18px; }
.ix-content .ix-ph h1 { font-size: 22px; }
.ix-content .adm-cal-list > .ix-ph { padding: 16px 20px 12px; margin-bottom: 0; }

/* ═════ tables: real grid structure ═════ */
.ix-content thead th {
  background: #fff6f1; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  padding: 11px 16px; border-bottom: 2px solid #ead9ce;
}
.ix-content tbody td { padding: 11px 16px; border-bottom: 1px solid #f1e4db; font-size: 13px; }
.ix-content tbody tr:nth-child(even) td { background: #fffdfb; }
.ix-content .ix-badge, .intern-rt .ix-badge { border-radius: 3px; font-weight: 600; padding: 3px 10px; }
.ix-content .ix-chip { border-radius: 3px; }

/* intern "recent attendance" mini-table */
.intern-rt-head { text-transform: uppercase; font-size: 11.5px; letter-spacing: .5px; border-bottom: 2px solid #ead9ce; padding-left: 20px; padding-right: 20px; }
.intern-rt-row { min-height: 50px; border-top: 1px solid #f1e4db; padding-left: 20px; padding-right: 20px; }
.intern-rt-row::before { top: 0; bottom: 0; width: 3px; border-radius: 0; }
.intern-date b { padding: 0; background: transparent; border-radius: 0; color: inherit; font-weight: 700; font-size: 13.5px; }

/* ═════ calendar: bordered grid instead of round bubbles ═════ */
.adm-cal-grid, .intern-cal-grid { gap: 1px; row-gap: 1px; background: #ead9ce; border: 1px solid #ead9ce; }
.adm-cal-grid > div:not([class]), .intern-cal-grid > div:not([class]) { background: #faf5f2; }
.adm-cal-dow, .intern-cal-dow { background: #fff6f1; padding: 8px 0; font-size: 11.5px; text-transform: uppercase; letter-spacing: .5px; }
.adm-cal-day, .intern-cal-day {
  margin: 0; height: 46px; border-radius: 0; background: #fff;
  align-items: flex-start; justify-content: flex-start; padding: 6px 8px; font-size: 14px; font-weight: 600;
}
.adm-cal-day.today, .intern-cal-day.today { box-shadow: none; }
.adm-cal-day.event { background: #fff4d6; }
.intern-cal-day.event { background: #fff4d6; }
.adm-cal-day.today.event, .intern-cal-day.today.event { background: linear-gradient(135deg, #f2733a, #e04a1a); }
.cal-dot, .adm-cal-dot { bottom: 6px; right: 7px; left: auto; width: 6px; height: 6px; border-radius: 1px; }
.adm-cal-nav, .intern-cal-nav, .adm-cal-today, .intern-cal-today { border-radius: 4px; }
.adm-cal-today, .intern-cal-today { font-size: 13px; padding: 5px 16px; }
.adm-cal-head strong, .intern-cal-head strong { font-size: 18px; letter-spacing: 0; }
.adm-cal-legend, .intern-cal-legend { border-top: 1px solid #ead9ce; font-size: 12.5px; }
.adm-cal-legend .dot, .intern-cal-legend .dot { border-radius: 2px; }
.adm-cal-next, .intern-cal-next { border-radius: 4px; }

/* ═════ side panels: list rows divided by lines, not floating chips ═════ */
.adm-duty-list { gap: 0; }
.adm-duty-list li { border: none; border-bottom: 1px solid #f1e4db; border-radius: 0; background: transparent; padding: 8px 2px; }
.adm-duty-list li:last-child { border-bottom: none; }
.crd-rows { gap: 0; }
.crd-row { border: none; border-bottom: 1px solid #f1e4db; border-radius: 0; background: transparent; padding: 10px 2px; }
.crd-row:last-child { border-bottom: none; }
.crd-row:hover { background: #fffaf6; border-color: #f1e4db; }
.crd-row-n { border-radius: 3px; }
.adm-duty-empty, .crd-empty, .intern-announce-empty { border-radius: 4px; border-width: 1px; }

/* ═════ forms, buttons, modal ═════ */
.ix-content .ix-b, .ix-content .ix-btn, .ix-content .ix-pill { border-radius: 4px; }
.ix-content .ix-btn { box-shadow: none; padding: 11px; font-weight: 600; }
.ix-content .ix-pill.active { box-shadow: none; }
.ix-content .ix-field input, .ix-content .ix-field select, .ix-content .ix-field textarea,
.ix-content .ix-search, .ix-content .ix-input, .ix-content .ix-select,
.ix-modal-wrap .ix-field input, .ix-modal-wrap .ix-field select { border-radius: 4px; }
.ix-content .ix-field label { font-size: 12.5px; font-weight: 600; }
.ix-modal-wrap .ix-modal { border-radius: 6px; }
.ix-content .ix-note, .ix-content .ix-alert, .ix-content .ix-msg { border-radius: 4px; }
.ix-drop { border-radius: 4px; border-width: 1px; }
.ix-drop-icon, .ix-nfc-badge { border-radius: 4px; }
.ix-step-dot { border-radius: 4px; }
.ix-steps li:not(:last-child)::after { border-radius: 0; height: 2px; }
.ix-bar, .ix-bar-fill { border-radius: 2px; }
.ix-bar { height: 10px; }
`;