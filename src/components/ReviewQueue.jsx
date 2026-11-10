// ReviewQueue.jsx
// One layout for every Approvals page:
//   status tabs (Needs my review · Waiting on others · Done) → search + filters → a table of items
//   → clicking a row opens a wide drawer with the details, the preview and the actions.
// After a decision the drawer moves on to the next item of the same tab, so a queue can be worked through
// without going back to the list. Rows can be ticked for bulk actions where a page allows it.
import { useEffect, useMemo, useState } from "react";
import { Drawer, Icon } from "./DashKit.jsx";

/**
 * tabs:        [{ key, label, items, hot?, empty?: [title, sub] }]
 * columns:     [{ label, render: (item) => node, className? }]
 * rowKey:      (item) => id
 * searchText:  (item) => string the search box looks in
 * toolbar:     extra filters next to the search (node, or (tabKey, { list, picked }) => node)
 * initialTab / initialQuery / initialOpen: where the page opens (e.g. coming from another page)
 * bulk:        (tabKey) => null | ((picked, clear) => node)   actions for the ticked rows
 * drawer:      (item, { close }) => { title, kicker, icon, actions, body, footer }
 * openLabel:   (tabKey) => text of the row button ("Review" / "View")
 */
export default function ReviewQueue({ tabs, columns, rowKey, searchText, toolbar = null, initialTab, initialQuery = "", initialOpen = null,
  bulk = () => null, drawer, openLabel }) {
  // the tab that needs action (marked hot) opens first and gets "Review"; otherwise the first tab
  const actKey = (tabs.find((t) => t.hot) || tabs[0])?.key;
  openLabel = openLabel || ((t) => (t === actKey ? "Review" : "View"));
  // always opens on the first tab ("Needs my review"), even when it is empty; nothing opens until a row is clicked
  const [tab, setTab] = useState(() => initialTab || actKey);
  const [q, setQ] = useState(initialQuery);
  const [openId, setOpenId] = useState(initialOpen);
  const [lastIdx, setLastIdx] = useState(0);
  const [picked, setPicked] = useState(() => new Set());
  const [page, setPage] = useState(0);

  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  const sq = q.trim().toLowerCase();
  const list = useMemo(() => cur.items.filter((x) => !sq || String(searchText(x) || "").toLowerCase().includes(sq)), [cur.items, sq, searchText]);

  // the open item; when it leaves the tab (approved, rejected, undone) the next one of the same tab opens
  let openIdx = openId == null ? -1 : list.findIndex((x) => rowKey(x) === openId);
  if (openId != null && openIdx < 0 && list.length) openIdx = Math.min(lastIdx, list.length - 1);
  const open = openIdx >= 0 ? list[openIdx] : null;
  useEffect(() => {
    if (openId == null) return;
    if (!open) setOpenId(null);
    else if (rowKey(open) !== openId) setOpenId(rowKey(open));
    else if (openIdx !== lastIdx) setLastIdx(openIdx);
  }, [open, openId, openIdx, lastIdx, rowKey]);

  // ticked rows only count while they are still in this tab
  const pickedItems = list.filter((x) => picked.has(rowKey(x)));
  const bulkFor = bulk(cur.key);
  const clear = () => setPicked(new Set());
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // "select all" ticks the rows of the page you are on
  const pageIds = list.slice(Math.min(page, Math.max(0, Math.ceil(list.length / PAGE) - 1)) * PAGE).slice(0, PAGE).map(rowKey);
  const allOn = pageIds.length > 0 && pageIds.every((id) => picked.has(id));

  // 10 rows a page; the page follows the open item (‹ › in the drawer can cross pages)
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const rows = list.slice(pg * PAGE, pg * PAGE + PAGE);
  useEffect(() => { if (openIdx >= 0) setPage(Math.floor(openIdx / PAGE)); }, [openIdx]);
  // page numbers: first, last, and the ones around the current page, with "…" between
  const nums = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - pg) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  const go = (k) => { setTab(k); setOpenId(null); setPage(0); clear(); };
  const openAt = (i) => { const x = list[i]; if (x) { setOpenId(rowKey(x)); setLastIdx(i); } };
  const view = open ? drawer(open, { close: () => setOpenId(null) }) : null;

  return (
    <div className="rq2">
      <style>{RQ2_CSS}</style>
      {/* row 1: the search (left) and the page's own buttons (right); row 2: the tabs, under the search */}
      <div className="rq2-bar">
        <label className="rq2-search"><Icon name="search" size={14} />
          <input type="search" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); clear(); }} aria-label="Search" /></label>
        {toolbar && <div className="rq2-tools">
          {typeof toolbar === "function" ? toolbar(cur.key, { list, picked: pickedItems }) : toolbar}
        </div>}
      </div>
      <div className="rq2-tabrow">
        <div className="rq2-tabs" role="tablist" aria-label="Show">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => go(t.key)}>
              {t.label} <span className={t.hot && t.items.length ? "rq2-n hot" : "rq2-n"}>{t.items.length}</span>
            </button>
          ))}
        </div>
      </div>

      {bulkFor && pickedItems.length > 0 && (
        <div className="rq2-bulk" role="region" aria-label="Selected items">
          <b>{pickedItems.length} selected</b>
          {bulkFor(pickedItems, clear)}
          <button type="button" className="ix-b ghost sm" onClick={clear}>Clear</button>
        </div>
      )}

      <div className="rq2-card">
        {list.length === 0 ? (
          <div className="rq2-empty">
            <span className="rq2-empty-ic"><Icon name={sq ? "search" : "check"} size={20} /></span>
            <b>{sq ? "No match" : cur.empty?.[0] || "Nothing here"}</b>
            <small>{sq ? "Try another name." : cur.empty?.[1] || ""}</small>
          </div>
        ) : (
          <div className="rq2-scroll">
            <table className="rq2-table">
              <thead>
                <tr>
                  {bulkFor && <th className="rq2-ck"><input type="checkbox" aria-label="Select all" checked={allOn}
                    onChange={() => setPicked((s) => { const n = new Set(s); pageIds.forEach((id) => (allOn ? n.delete(id) : n.add(id))); return n; })} /></th>}
                  {columns.map((c) => <th key={c.label} className={c.className}>{c.label}</th>)}
                  <th className="rq2-go" aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {rows.map((x, j) => {
                  const i = pg * PAGE + j;
                  const id = rowKey(x);
                  return (
                    <tr key={id} className={open && rowKey(open) === id ? "on" : ""} onClick={() => openAt(i)}>
                      {bulkFor && <td className="rq2-ck" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label="Select" checked={picked.has(id)} onChange={() => toggle(id)} /></td>}
                      {columns.map((c) => <td key={c.label} className={c.className} data-label={c.label}>{c.render(x)}</td>)}
                      <td className="rq2-go"><button type="button" className="ix-b ghost sm" onClick={(e) => { e.stopPropagation(); openAt(i); }}>
                        {openLabel(cur.key)} <Icon name="chevronRight" size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > PAGE && (
          <nav className="rq2-pager" aria-label="Pages">
            <span className="rq2-pages">
              <button type="button" disabled={pg === 0} onClick={() => setPage(pg - 1)}><Icon name="chevronLeft" size={13} /> Previous</button>
              {nums.map((n, k) => n === "…" ? <span key={"g" + k} className="gap">…</span> : (
                <button key={n} type="button" className={n === pg ? "on" : ""} aria-current={n === pg ? "page" : undefined} onClick={() => setPage(n)}>{n + 1}</button>
              ))}
              <button type="button" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next <Icon name="chevronRight" size={13} /></button>
            </span>
            <small>Showing {pg * PAGE + 1}–{Math.min(list.length, pg * PAGE + PAGE)} of {list.length}</small>
          </nav>
        )}
      </div>

      {view && (
        <Drawer wide inPage icon={view.icon || "file"} kicker={view.kicker} title={view.title} onClose={() => setOpenId(null)}
          actions={<>
            {view.actions}
            <span className="rq2-nav">
              <button type="button" aria-label="Previous" disabled={openIdx <= 0} onClick={() => openAt(openIdx - 1)}><Icon name="chevronLeft" size={15} /></button>
              <small>{openIdx + 1} of {list.length}</small>
              <button type="button" aria-label="Next" disabled={openIdx >= list.length - 1} onClick={() => openAt(openIdx + 1)}><Icon name="chevronRight" size={15} /></button>
            </span>
          </>}
          footer={view.footer ? <div className="rq2-foot">{view.footer}</div> : null}>
          <div className="rq2-body">{view.body}</div>
        </Drawer>
      )}
    </div>
  );
}

const PAGE = 10;   // rows a page

/* The page numbers under a table (the same look as the Approvals tables), for any list:
   page is 1-based. ‹ Previous · 1 … 4 5 6 … 9 · Next ›, then "Showing 31–40 of 87". */
export function Pager({ page, total, perPage, onPage }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  const pg = Math.min(Math.max(1, page), pages);
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - pg) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <nav className="rq2-pager" aria-label="Pages">
      <style>{PAGER_CSS}</style>
      <span className="rq2-pages">
        <button type="button" disabled={pg <= 1} onClick={() => onPage(pg - 1)}><Icon name="chevronLeft" size={13} /> Previous</button>
        {nums.map((n, k) => n === "…" ? <span key={"g" + k} className="gap">…</span> : (
          <button key={n} type="button" className={n === pg ? "on" : ""} aria-current={n === pg ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
        ))}
        <button type="button" disabled={pg >= pages} onClick={() => onPage(pg + 1)}>Next <Icon name="chevronRight" size={13} /></button>
      </span>
      <small>Showing {(pg - 1) * perPage + 1}–{Math.min(total, pg * perPage)} of {total}</small>
    </nav>
  );
}
const PAGER_CSS = `
.rq2-pager { flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 14px; border-top: 1px solid #eef0f4; background: #fff; }
.rq2-pager > small { font-size: 12.5px; color: #64748b; }
.rq2-pages { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; }
.rq2-pages button { min-width: 34px; height: 34px; padding: 0 10px !important; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #374151; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.rq2-pages button:hover:not(:disabled) { border-color: #f6c7b0; color: #c2410c; }
.rq2-pages button.on { background: #e8582a; border-color: #e8582a; color: #fff; }
.rq2-pages button:disabled { opacity: .4; cursor: default; }
.rq2-pages .gap { min-width: 22px; text-align: center; color: #9ca3af; font-size: 12.5px; }
`;

const RQ2_CSS = `
/* the table is only as tall as its rows (10 a page); the page numbers sit right under the last row */
.rq2 { display: flex; flex-direction: column; gap: 12px; flex: none !important; }
.rq2-bar { display: flex; align-items: center; justify-content: flex-start; gap: 12px; flex-wrap: wrap; flex: none; }
.rq2-tabrow { display: flex; flex: none; margin-top: -2px; }
.rq2-tabs { display: inline-flex; gap: 4px; padding: 3px; background: #f3f4f6; border: 1px solid #e8ebf0; border-radius: 10px; }
.rq2-tabs button { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 12.5px; font-weight: 600; color: #4b5563; cursor: pointer; white-space: nowrap; }
.rq2-tabs button:hover { color: #c2410c; background: rgba(255,255,255,.55); }
.rq2-tabs button.on { background: #fff; color: #c2410c; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.rq2-n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #e5e7eb; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
.rq2-n.hot { background: #ef4444; color: #fff; }
.rq2-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.rq2-search { display: inline-flex; background: #fff !important; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #9ca3af; width: 320px; max-width: 100%; box-sizing: border-box; }
.rq2-search input { border: 0 !important; outline: 0; background: transparent !important; font: inherit; font-size: 13px; color: #111827; width: 100%; padding: 0 !important; box-shadow: none !important; height: auto !important; }
.rq2-tools .ix-select { height: 38px; font-size: 13px; }
.rq2-bulk { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; border-radius: 12px; background: #fff7f2; border: 1px solid #fbd9c7; flex: none; }
.rq2-bulk b { font-size: 13px; color: #9a3412; margin-right: auto; }
.rq2-card { flex: none; background: #fff; border: 1px solid #e8ebf0; border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; }
.rq2-card:has(> .rq2-empty) { min-height: 280px; }
/* nothing in the tab: the card reaches the bottom of the page (the same bottom line as the other pages)
   and the "All caught up" message sits in its middle */
@media (min-width: 761px) {
  .ix-page.lay2 .ix-main:has(.rq2-card > .rq2-empty) { display: flex !important; flex-direction: column !important; }
  .ix-page.lay2 .ix-main:has(.rq2-card > .rq2-empty) > .ix-content { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main:has(.rq2-card > .rq2-empty) > .ix-content > * { flex: none; }
  .ix-page.lay2 .ix-main:has(.rq2-card > .rq2-empty) .grp-body { flex: 1 1 auto !important; display: flex; flex-direction: column; }
  .ix-page.lay2 .ix-main:has(.rq2-card > .rq2-empty) .grp-body > * { flex: none; }
  .ix-page.lay2 .ix-main:has(.rq2-card > .rq2-empty) :is(.grp-body, .ix-content) > .rq2 { flex: 1 1 auto !important; }
  .rq2:has(> .rq2-card > .rq2-empty) > .rq2-card { flex: 1 1 auto; }
}
.rq2-scroll { overflow-x: auto; }
.rq2-table { width: 100%; border-collapse: collapse; font-size: 13px; }
/* the header row stays on top with a solid white background (rows never show through it) */
.rq2-table thead th { position: sticky; top: 0; z-index: 3; background: #fff !important; text-align: left; font-size: 11.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: #64748b; padding: 12px 14px; border-bottom: 0 !important; box-shadow: inset 0 -1px 0 #e8ebf0; white-space: nowrap; }
/* pages: 10 rows each, numbers at the bottom */
.rq2-pager { flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 14px; border-top: 1px solid #eef0f4; background: #fff; }
.rq2-pager > small { font-size: 12.5px; color: #64748b; }
.rq2-pages { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; }
.rq2-pages button { min-width: 34px; height: 34px; padding: 0 10px !important; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #374151; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.rq2-pages button:hover:not(:disabled) { border-color: #f6c7b0; color: #c2410c; }
.rq2-pages button.on { background: #e8582a; border-color: #e8582a; color: #fff; }
.rq2-pages button:disabled { opacity: .4; cursor: default; }
.rq2-pages .gap { min-width: 22px; text-align: center; color: #9ca3af; font-size: 12.5px; }
.rq2-table td { padding: 10px 14px; border-bottom: 1px solid #f1f3f6; color: #1f2937; vertical-align: middle; }
.rq2-table tbody tr { cursor: pointer; transition: background .12s; }
.rq2-table tbody tr:hover { background: #fafafb; }
/* the open row: drawn on the cells, so the zebra stripes of other tables (even rows) can't cover it */
.rq2-table tbody tr.on { background: #fff4ee; }
.rq2-table tbody tr.on > td { background: #fff4ee !important; }
.rq2-table tbody tr.on > td:first-child { box-shadow: inset 3px 0 0 #ea580c; }
.rq2-ck { width: 36px; padding-right: 0 !important; }
.rq2-ck input { width: 16px; height: 16px; accent-color: #e8582a; cursor: pointer; }
.rq2-go { width: 1%; text-align: right; white-space: nowrap; }
.rq2-go .ix-b { display: inline-flex; align-items: center; gap: 4px; }
.rq2-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.rq2-who b { display: block; font-size: 13.5px; font-weight: 600; color: #0f172a; white-space: nowrap; }
.rq2-who small, .rq2-sub { display: block; font-size: 12px; color: #64748b; margin-top: 1px; }
.rq2-main { font-weight: 600; color: #0f172a; }
.rq2-muted { color: #64748b; white-space: nowrap; }
.rq2-file { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #475569; }
.rq2-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.rq2-empty-ic { width: 44px; height: 44px; border-radius: 50%; background: #e9f8ef; color: #16a34a; display: grid; place-items: center; margin-bottom: 6px; }
.rq2-empty b { font-size: 14.5px; color: #0f172a; } .rq2-empty small { font-size: 12.5px; color: #64748b; max-width: 320px; }
/* drawer */
.rq2-nav { display: inline-flex; align-items: center; gap: 4px; padding: 2px; border: 1px solid #e7e9ee; border-radius: 99px; }
.rq2-nav button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; display: grid; place-items: center; cursor: pointer; color: #374151; padding: 0 !important; }
.rq2-nav button:hover:not(:disabled) { background: #f3f4f6; }
.rq2-nav button:disabled { opacity: .35; cursor: default; }
.rq2-nav small { font-size: 12px; color: #6b7280; min-width: 46px; text-align: center; }
.ix-drawer.wide .ix-drawer-body { display: flex; flex-direction: column; }
.rq2-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.ix-drawer.wide .ix-drawer-foot { display: block; }
.rq2-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rq2-foot .ix-input { flex: 1 1 220px; min-width: 0; }
.rq2-foot .ix-b { flex: none; width: auto; }
.rq2-kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; flex: none; }
.rq2-kv > div { border: 1px solid #eef0f4; background: #fafbfc; border-radius: 10px; padding: 9px 12px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rq2-kv small { font-size: 11.5px; color: #64748b; }
.rq2-kv b { font-size: 13.5px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rq2-result { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; font-size: 13px; color: #334155; }
.rq2-result.ok { color: #15803d; } .rq2-result.bad { color: #b91c1c; }
.rq2-result em { color: #475569; }
/* phones: each row becomes a card */
@media (max-width: 760px) {
  .rq2-bar { flex-direction: column; align-items: stretch; }
  .rq2-tabs { overflow-x: auto; }
  .rq2-search { min-width: 0; flex: none; width: 100%; }
  .rq2-tools { margin-left: 0; } .rq2-tools > * { flex: 1 1 auto; }
  .rq2-table thead { display: none; }
  .rq2-table, .rq2-table tbody, .rq2-table tr, .rq2-table td { display: block; width: auto; }
  .rq2-table tr { padding: 10px 12px; border-bottom: 1px solid #f1f3f6; position: relative; }
  .rq2-table td { border: 0; padding: 3px 0; }
  .rq2-table td.rq2-ck { position: absolute; right: 12px; top: 12px; }
  .rq2-go { text-align: left; }
  .rq2-kv { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;