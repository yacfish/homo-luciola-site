// Représentations / Performances: horizontal interactive timeline.
// Residency stays are spans (one segment per period), performances are points.
// Drag or swipe sideways, arrow keys, or the buttons move through time;
// zoom goes from the wide history to a close-up. The server-rendered list in
// the page stays as the accessible fallback.

const DAY = 86400000;
const AXIS_LOCK_PX = 10;
const AXIS_GAP_MS = 180;

// Per-gesture axis lock, shared with the section-snap controller. A trackpad
// swipe that starts horizontal must keep panning (via deltaX) for the whole
// gesture, including an inertia tail that later looks vertical, and must
// never trigger a section step. The lock lasts until 180ms of silence.
let tlAxisLock = null;
let tlAccX = 0;
let tlAccY = 0;
let tlAxisAt = 0;
let tlAxisTimer = 0;

const axisNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const clearTlAxis = () => {
  tlAxisLock = null;
  tlAccX = 0;
  tlAccY = 0;
  if (tlAxisTimer) {
    clearTimeout(tlAxisTimer);
    tlAxisTimer = 0;
  }
};

const armTlAxisQuiet = () => {
  if (tlAxisTimer) clearTimeout(tlAxisTimer);
  tlAxisTimer = setTimeout(() => {
    if (axisNow() - tlAxisAt >= AXIS_GAP_MS) clearTlAxis();
    else armTlAxisQuiet();
  }, AXIS_GAP_MS);
};

const beginTlAxisGesture = () => {
  const t = axisNow();
  if (tlAxisAt && t - tlAxisAt >= AXIS_GAP_MS) clearTlAxis();
  tlAxisAt = t;
  armTlAxisQuiet();
};

const lockTlAxis = () => {
  if (tlAxisLock) return tlAxisLock;
  if (tlAccX < AXIS_LOCK_PX && tlAccY < AXIS_LOCK_PX) return null;
  tlAxisLock = tlAccX > tlAccY ? "x" : "y";
  return tlAxisLock;
};

export function noteTlWheel(e) {
  beginTlAxisGesture();
  if (e.shiftKey) {
    tlAxisLock = "x";
    return "x";
  }
  tlAccX += Math.abs(e.deltaX || 0);
  tlAccY += Math.abs(e.deltaY || 0);
  return lockTlAxis();
}

// dx, dy are totals from the start of the pointer/touch gesture.
export function noteTlDrag(dx, dy) {
  beginTlAxisGesture();
  tlAccX = Math.abs(dx);
  tlAccY = Math.abs(dy);
  return lockTlAxis();
}

export function tlAxis() {
  return tlAxisLock;
}

export function resetTlAxis() {
  clearTlAxis();
}
const toDay = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const fromDay = (d) => new Date(d * DAY);

export function clientToday(fallback) {
  const q = new URLSearchParams(location.search).get("today");
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  if (window.__HL_TODAY && /^\d{4}-\d{2}-\d{2}$/.test(window.__HL_TODAY)) return window.__HL_TODAY;
  const n = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}` || fallback;
}

function setupOne(root) {
  const viewport = root.querySelector(".tl-viewport");
  const ticks = root.querySelector(".tl-ticks");
  const todayEl = root.querySelector(".tl-today");
  const locale = root.dataset.locale || document.documentElement.lang || "fr";
  const items = [...root.querySelectorAll(".tl-item")].map((li) => {
    let periods = [];
    try { periods = JSON.parse(li.dataset.periods || "[]"); } catch (_err) { periods = []; }
    const start = toDay(li.dataset.start);
    const end = toDay(li.dataset.end || li.dataset.start);
    return {
      li,
      residency: li.classList.contains("is-residency"),
      start,
      end,
      periods: (periods.length ? periods : [{ start: li.dataset.start, end: li.dataset.end }]).map((p) => [toDay(p.start), toDay(p.end || p.start)]),
    };
  });
  if (!items.length) return null;
  const today = toDay(clientToday(root.dataset.today));
  root.classList.add("is-live");

  // Build the span segments once.
  for (const it of items) {
    const mark = it.li.querySelector(".tl-mark");
    if (it.residency && mark && !mark.children.length) {
      for (let i = 0; i < it.periods.length; i++) {
        const seg = document.createElement("span");
        seg.className = "tl-seg";
        mark.appendChild(seg);
      }
    }
  }

  const lo = Math.min(today, ...items.map((i) => i.start)) - 45;
  const hi = Math.max(today, ...items.map((i) => i.end)) + 45;
  const width = () => Math.max(1, viewport.clientWidth);
  const fitScale = () => width() / Math.max(30, hi - lo);
  const MAX_PPD = 40;
  let ppd = fitScale();
  let center = (lo + hi) / 2;

  const fmt = (opts) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts });
  const fYear = fmt({ year: "numeric" });
  const fMonth = fmt({ month: "short" });
  const fMonthYear = fmt({ month: "short", year: "numeric" });
  const fDay = fmt({ day: "numeric", month: "short" });

  const xOf = (day) => (day - center) * ppd + width() / 2;

  const renderTicks = () => {
    const w = width();
    const startDay = Math.floor(center - w / 2 / ppd) - 1;
    const endDay = Math.ceil(center + w / 2 / ppd) + 1;
    const out = [];
    const d0 = fromDay(startDay);
    if (ppd < 0.12) {
      for (let y = d0.getUTCFullYear(); y <= fromDay(endDay).getUTCFullYear() + 1; y++) {
        const day = Math.floor(Date.UTC(y, 0, 1) / DAY);
        out.push([day, fYear.format(fromDay(day)), true]);
      }
    } else if (ppd < 9) {
      const step = ppd < 0.5 ? 3 : 1;
      let y = d0.getUTCFullYear();
      let m = d0.getUTCMonth();
      for (let guard = 0; guard < 400; guard++) {
        const day = Math.floor(Date.UTC(y, m, 1) / DAY);
        if (day > endDay) break;
        if (m % step === 0) out.push([day, m === 0 ? fMonthYear.format(fromDay(day)) : fMonth.format(fromDay(day)), m === 0]);
        m += 1;
        if (m > 11) { m = 0; y += 1; }
      }
    } else {
      const step = ppd < 20 ? 7 : 1;
      for (let day = startDay; day <= endDay; day++) {
        const dt = fromDay(day);
        if (dt.getUTCDate() === 1) out.push([day, fMonthYear.format(dt), true]);
        else if (step === 1 || dt.getUTCDay() === 1) out.push([day, fDay.format(dt), false]);
      }
    }
    ticks.innerHTML = out
      .map(([day, label, major]) => `<span class="tl-tick${major ? " is-major" : ""}" style="left:${xOf(day).toFixed(1)}px"><span>${label}</span></span>`)
      .join("");
  };

  const textWidthCache = new Map();
  const textWidthOf = (li) => {
    if (textWidthCache.has(li)) return textWidthCache.get(li);
    const text = li.querySelector(".tl-text");
    const tw = (text ? text.offsetWidth : 120) + 16;
    textWidthCache.set(li, tw);
    return tw;
  };
  const invalidateTextWidths = () => textWidthCache.clear();

  const renderItems = () => {
    const w = width();
    const lanes = { top: [], bottom: [] };
    const sorted = items.slice().sort((a, b) => a.start - b.start);
    for (const it of sorted) {
      const x0 = xOf(it.start);
      const x1 = it.residency ? xOf(it.end + 1) : xOf(it.start + 0.5);
      const li = it.li;
      li.style.setProperty("--x", (it.residency ? x0 : x1).toFixed(1) + "px");
      if (it.residency) {
        li.style.setProperty("--w", Math.max(6, x1 - x0).toFixed(1) + "px");
        const segs = li.querySelectorAll(".tl-seg");
        it.periods.forEach(([a, b], i) => {
          const seg = segs[i];
          if (!seg) return;
          seg.style.left = ((a - it.start) * ppd).toFixed(1) + "px";
          seg.style.width = Math.max(4, (b - a + 1) * ppd).toFixed(1) + "px";
        });
      }
      const tw = textWidthOf(li);
      // Labels stay with their marks: never clamp them to the viewport edge.
      const lx = it.residency ? x0 : x1 - 8;
      li.style.setProperty("--lx", (lx - (it.residency ? x0 : x1)).toFixed(1) + "px");
      const group = it.residency ? lanes.top : lanes.bottom;
      let lane = group.findIndex((right) => right < lx);
      if (lane === -1) { lane = group.length; group.push(0); }
      if (lane > 2) lane = 2;
      group[lane] = lx + tw;
      li.style.setProperty("--lane", String(lane));
      // Hide the description (and the item) once the shape itself is gone.
      let shapeInView = false;
      if (it.residency) {
        shapeInView = it.periods.some(([a, b]) => {
          const s0 = xOf(a);
          const s1 = xOf(b + 1);
          return s1 > 0 && s0 < w;
        });
      } else {
        const markL = x1 - 8;
        const markR = x1 + 8;
        shapeInView = markR > 0 && markL < w;
      }
      li.classList.toggle("is-off", !shapeInView);
    }
    const tx = xOf(today + 0.5);
    todayEl.style.left = tx.toFixed(1) + "px";
    todayEl.hidden = tx < -2 || tx > w + 2;
  };

  const clamp = () => {
    const w = width();
    const minP = fitScale() / 4;
    ppd = Math.max(minP, Math.min(MAX_PPD, ppd));
    // Allow travel well into the past and the future, but not into nowhere.
    const pad = w / ppd;
    center = Math.max(lo - pad, Math.min(hi + pad, center));
  };

  const render = () => {
    clamp();
    renderTicks();
    renderItems();
    root.dataset.ppd = ppd.toFixed(3);
    root.dataset.center = fromDay(Math.round(center)).toISOString().slice(0, 10);
  };

  const zoomAt = (factor, clientX) => {
    const rect = viewport.getBoundingClientRect();
    const px = clientX == null ? rect.width / 2 : clientX - rect.left;
    const dayAt = center + (px - rect.width / 2) / ppd;
    ppd *= factor;
    clamp();
    center = dayAt - (px - rect.width / 2) / ppd;
    render();
  };
  const panPx = (dx) => {
    center += dx / ppd;
    render();
  };

  const actions = {
    earlier: () => panPx(-width() / 2),
    later: () => panPx(width() / 2),
    "zoom-in": () => zoomAt(2),
    "zoom-out": () => zoomAt(0.5),
    today: () => { center = today; if (ppd < 2) ppd = 2; render(); },
  };
  root.querySelectorAll("[data-tl]").forEach((btn) => {
    btn.addEventListener("click", () => (actions[btn.dataset.tl] || (() => {}))());
  });

  // Drag / swipe sideways
  let drag = null;
  let suppressClick = false;
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, c: center, moved: false };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const axis = noteTlDrag(dx, dy);
    if (!drag.moved) {
      if (!axis) return;
      if (axis === "y") {
        drag = null; // vertical gesture: leave it to the section controller
        return;
      }
      drag.moved = true;
      viewport.classList.add("is-dragging");
      try { viewport.setPointerCapture(e.pointerId); } catch (_err) { /* ignore */ }
    }
    // Once locked horizontal, keep panning with dx even if the swipe drifts vertical.
    if (axis === "y") return;
    center = drag.c - dx / ppd;
    render();
  });
  const endDrag = () => {
    if (drag && drag.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("click", (e) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  viewport.addEventListener("wheel", (e) => {
    // Ctrl/pinch-wheel zooms. A gesture locked horizontal pans with deltaX
    // for its whole life (inertia included) and never steps sections.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX);
      return;
    }
    // noteTlWheel is applied in the capture-phase section controller; read the lock.
    if (e.shiftKey || tlAxis() === "x") {
      e.preventDefault();
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (dx) panPx(dx);
    }
  }, { passive: false });
  viewport.addEventListener("keydown", (e) => {
    const map = {
      ArrowLeft: () => panPx(-width() / 6),
      ArrowRight: () => panPx(width() / 6),
      "+": () => zoomAt(2),
      "=": () => zoomAt(2),
      "-": () => zoomAt(0.5),
      _: () => zoomAt(0.5),
      Home: actions.today,
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  // Linked highlight: hovering or focusing the mark or the description
  // lights both (CSS), and a class keeps the pair on top when items overlap
  // and after a touch tap. Pan/zoom only moves the same elements.
  const setHot = (li) => {
    for (const it of items) it.li.classList.toggle("is-hot", it.li === li);
  };
  const clearHot = () => {
    for (const it of items) it.li.classList.remove("is-hot");
  };
  viewport.addEventListener("pointerover", (e) => {
    const li = e.target.closest && e.target.closest(".tl-item");
    if (li && !li.classList.contains("is-off")) setHot(li);
  });
  viewport.addEventListener("pointerout", (e) => {
    const li = e.target.closest && e.target.closest(".tl-item");
    if (!li) return;
    const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest(".tl-item") : null;
    if (to === li) return;
    if (li.contains(document.activeElement)) return;
    li.classList.remove("is-hot");
  });
  viewport.addEventListener("pointerdown", (e) => {
    const li = e.target.closest && e.target.closest(".tl-item");
    if (li && !li.classList.contains("is-off")) setHot(li);
    else if (e.pointerType === "touch" || e.pointerType === "pen") clearHot();
  });

  // Keep links inside the viewport reachable: bring a focused entry into view.
  viewport.addEventListener("focusin", (e) => {
    const li = e.target.closest && e.target.closest(".tl-item");
    if (!li) return;
    setHot(li);
    const it = items.find((x) => x.li === li);
    if (!it) return;
    const x = xOf(it.start);
    if (x < 0 || x > width() - 40) { center = it.start; render(); }
  });
  viewport.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const li = active && active.closest && active.closest(".tl-item");
      if (li && viewport.contains(li)) setHot(li);
      else if (!viewport.querySelector(".tl-item:hover")) clearHot();
    });
  });

  window.addEventListener("resize", () => { invalidateTextWidths(); render(); }, { passive: true });
  render();
  // Force measure/paint while the section is still off-screen so the first
  // arrival does not pay a layout spike mid-transition.
  void viewport.offsetWidth;
  invalidateTextWidths();
  items.forEach((it) => textWidthOf(it.li));
  render();
  // Fonts change label widths, and so the lanes.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { invalidateTextWidths(); render(); }).catch(() => {});
  }
  const api = { render, zoomIn: actions["zoom-in"], zoomOut: actions["zoom-out"], pan: panPx, get ppd() { return ppd; }, get center() { return center; }, get axis() { return tlAxis(); } };
  root.__tl = api;
  window.__hlTlAxis = { get axis() { return tlAxis(); }, reset: resetTlAxis };
  return api;
}

export function setupTimelines() {
  document.querySelectorAll("[data-timeline]").forEach(setupOne);
}
