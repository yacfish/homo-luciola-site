// Hero highlight of the current or next entry. Decided in the browser from
// today's date, so it switches on one month before a residency or a
// performance starts and off after it ends, without a rebuild.
import { clientToday } from "./timeline.js";
import { pickDateLine } from "/lib/format-event.mjs";

const ICON_CALENDAR = '<svg class="event-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>';
const ICON_PIN = '<svg class="event-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';

function metaItem(kind, text) {
  const wrap = document.createElement("span");
  wrap.className = kind === "where" || kind === "venue" ? (kind === "venue" ? "event-venue" : "event-where") : "event-when";
  wrap.innerHTML = kind === "where" || kind === "venue" ? ICON_PIN : ICON_CALENDAR;
  const label = document.createElement("span");
  label.className = "event-meta-text";
  label.textContent = text;
  wrap.append(label);
  return wrap;
}

function whenItem(lines) {
  const list = Array.isArray(lines) ? lines.filter(Boolean) : (lines ? [lines] : []);
  if (!list.length) return null;
  const wrap = document.createElement("span");
  wrap.className = "event-when";
  wrap.innerHTML = ICON_CALENDAR;
  const stack = document.createElement("span");
  stack.className = "event-when-lines";
  for (const text of list) {
    const line = document.createElement("span");
    line.className = "event-when-line";
    line.textContent = text;
    stack.append(line);
  }
  wrap.append(stack);
  return wrap;
}


function monthBefore(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 2, d));
  // Keep the day when the previous month is shorter (31 March -> 28/29 February).
  if (dt.getUTCMonth() !== ((m - 2 + 12) % 12)) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export function pickHighlight(rows, today) {
  const current = rows.filter((r) => r.start <= today && today <= r.end);
  // Several at once (a performance inside a residency): the most recent start wins.
  if (current.length) return { row: current.sort((a, b) => b.start.localeCompare(a.start))[0], now: true };
  const soon = rows.filter((r) => r.start > today && monthBefore(r.start) <= today).sort((a, b) => a.start.localeCompare(b.start));
  if (soon.length) return { row: soon[0], now: false };
  return null;
}

// Same current/soon rule as the hero highlight; if nothing is current or due
// within a month, fall back to the most recent past entry (or the next future
// one when the page has no past entries yet).
export function pickLandingEntry(rows, today) {
  const hit = pickHighlight(rows, today);
  if (hit) return hit.row;
  const past = rows
    .filter((r) => r.end < today)
    .sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
  if (past.length) return past[0];
  const future = rows
    .filter((r) => r.start > today)
    .sort((a, b) => a.start.localeCompare(b.start));
  return future[0] || rows[0] || null;
}

function renderEmptyHighlight(el) {
  el.hidden = false;
  el.classList.add("is-empty");
  el.setAttribute("aria-hidden", "true");
  el.removeAttribute("data-event-id");
  el.innerHTML = `<span class="hero-highlight-link" aria-hidden="true">
    <span class="hero-highlight-head"><span class="hero-highlight-label">&nbsp;</span><span class="hero-highlight-title">&nbsp;</span></span>
    <span class="event-meta hero-highlight-meta"></span>
  </span>`;
}

export function setupHeroHighlight() {
  const el = document.querySelector("[data-hero-highlight]");
  const data = document.querySelector("script[data-hl-events]");
  if (!el || !data) return;
  let rows = [];
  try { rows = JSON.parse(data.textContent || "[]"); } catch (_err) { rows = []; }
  const pick = pickHighlight(rows, clientToday());
  if (!pick) {
    renderEmptyHighlight(el);
    return;
  }
  const { row, now } = pick;
  const label = now ? el.dataset.labelNow : el.dataset.labelSoon;
  el.classList.remove("is-empty");
  el.removeAttribute("aria-hidden");
  el.hidden = false;
  el.textContent = "";
  const a = document.createElement("a");
  a.href = row.href;
  a.className = "hero-highlight-link";
  const head = document.createElement("span");
  head.className = "hero-highlight-head";
  const k = document.createElement("span");
  k.className = "hero-highlight-label";
  k.textContent = label;
  const title = document.createElement("span");
  title.className = "hero-highlight-title";
  title.textContent = row.title;
  title.title = row.title;
  head.append(k, title);
  const parts = [head];
  const dateText = pickDateLine(row.dateLines, clientToday()) || "";
  const place = row.place || (row.venue && row.city ? `${row.venue} - ${row.city}` : (row.venue || ""));
  if (dateText || place) {
    const d = document.createElement("span");
    d.className = "event-meta hero-highlight-meta";
    if (dateText) d.append(metaItem("when", dateText));
    if (place) d.append(metaItem("venue", place));
    parts.push(d);
  }
  a.append(...parts);
  el.appendChild(a);
  el.dataset.eventId = row.id;
  el.hidden = false;
}

if (typeof window !== "undefined") window.__hlSetupHeroHighlight = setupHeroHighlight;
