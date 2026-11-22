import { sound, setupSoundButtons, syncSoundButtons } from "./sound.js";
import { setupEnterGate } from "./gate.js";
import { setupModals, closeModal, openTrailerIfRequested } from "./modal.js";
import { setupGalleryLightbox, closeLightbox, setupGalleryRandom } from "./gallery-lightbox.js";
import { setupTimelines, noteTlWheel, noteTlDrag, tlAxis, resetTlAxis, clientToday } from "./timeline.js";
import { setupHeroHighlight, pickLandingEntry } from "./highlight.js";
import { setupRouter } from "./router.js";

const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine) and (hover: hover)");

function supportsScrollTimelines() {
  try {
    return CSS.supports("animation-timeline: view()") || CSS.supports("animation-timeline: scroll()");
  } catch {
    return false;
  }
}

// Loop files are authored in scripts/loop_timing.py (0.25 s hold + 0.75 s
// fade). playbackRate 2 is the on-screen speed: 0.125 s hold + 0.375 s fade.
function setupBgSeg() {
  const raw = new URLSearchParams(location.search).get("bgseg");
  const seg = raw === "3" ? "3" : "6";
  document.querySelectorAll("[data-bgseg]").forEach((root) => {
    root.querySelectorAll("source[data-src-3][data-src-6]").forEach((el) => {
      el.src = el.getAttribute(seg === "3" ? "data-src-3" : "data-src-6");
    });
    root.querySelectorAll("[data-poster-3][data-poster-6]").forEach((el) => {
      const poster = el.getAttribute(seg === "3" ? "data-poster-3" : "data-poster-6");
      if (el.tagName === "IMG") el.src = poster;
      else el.setAttribute("poster", poster);
    });
    const video = root.querySelector("video.hero-video");
    if (video) video.load();
  });
}

function setupHeroMotion() {
  const videos = [...document.querySelectorAll(".hero-video")];
  if (!videos.length) return;

  const playOne = (video) => {
    if (reduceMq.matches) {
      video.pause();
      return;
    }
    video.playbackRate = 2;
    if (video.paused) video.play().catch(() => {});
  };
  const pauseOne = (video) => {
    if (!video.paused) video.pause();
  };
  const warmOne = (video) => {
    if (!video || reduceMq.matches) return;
    if (video.preload !== "auto") video.preload = "auto";
    if (video.readyState < 2) {
      try { video.load(); } catch (_err) { /* ignore */ }
    }
  };

  const sync = (playList, warmList = []) => {
    const play = new Set(playList.filter(Boolean));
    const warm = new Set(warmList.filter(Boolean));
    for (const video of videos) {
      if (play.has(video)) playOne(video);
      else pauseOne(video);
      if (warm.has(video) && !play.has(video)) warmOne(video);
    }
  };

  const initial = document.querySelector(".hero-track .hero-video") || videos[0];
  const apply = () => {
    if (reduceMq.matches) {
      videos.forEach(pauseOne);
      return;
    }
    sync(initial ? [initial] : []);
  };
  apply();
  reduceMq.addEventListener("change", apply);
  window.__hlVideos = { sync, videos };
}

function setupTabs() {
  const list = document.querySelector(".tabs[role='tablist']");
  if (!list) return;
  const tabs = [...list.querySelectorAll("[role='tab']")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    });
  });
}

const scrollState = { vel: 0, y: 0, t: 0 };

const SCROLL_VEL_CAP = 2.4; // px per ms

function sampleScrollVel(now) {
  if (scrollState.t === now) return scrollState.vel;
  const y = window.scrollY || 0;
  if (!scrollState.t) {
    scrollState.y = y;
    scrollState.t = now;
    scrollState.vel = 0;
    return 0;
  }
  const dt = now - scrollState.t;
  if (dt > 100) {
    scrollState.vel = 0;
  } else if (dt > 0) {
    let inst = (y - scrollState.y) / dt;
    if (inst > SCROLL_VEL_CAP) inst = SCROLL_VEL_CAP;
    if (inst < -SCROLL_VEL_CAP) inst = -SCROLL_VEL_CAP;
    scrollState.vel = inst;
  }
  scrollState.y = y;
  scrollState.t = now;
  return scrollState.vel;
}

/** Main copy: fully visible by ~18%, holds, soft exit after 90%. */
function arriveFromProgress(p, inEnd = 0.18, outStart = 0.9) {
  if (p <= 0) return 0;
  if (p >= 1) return 0.2;
  if (p < inEnd) return p / inEnd;
  if (p > outStart) return 1 - (1 - 0.2) * ((p - outStart) / (1 - outStart));
  return 1;
}

function coverProgress(el, vh) {
  const r = el.getBoundingClientRect();
  const start = vh;
  const end = -r.height;
  const span = start - end;
  if (span <= 0) return 1;
  return (start - r.top) / span;
}


function titleGlyphSpan(el) {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let min = Infinity;
  let max = -Infinity;
  let found = false;
  let node;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue || "";
    for (let i = 0; i < raw.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width < 0.2 && r.height < 0.2) continue;
      found = true;
      min = Math.min(min, r.top);
      max = Math.max(max, r.bottom);
    }
  }
  return found ? max - min : 0;
}

function applyEdgeTravel(el, from, start, to) {
  const fromV = from.toFixed(1) + "px";
  const startV = start.toFixed(1) + "px";
  const toV = to.toFixed(1) + "px";
  el.style.setProperty("--edge-from", fromV);
  el.style.setProperty("--edge-start", startV);
  el.style.setProperty("--edge-to", toV);
  const track = el.closest("[data-pin]");
  if (track) {
    track.style.setProperty("--edge-from", fromV);
    track.style.setProperty("--edge-start", startV);
    track.style.setProperty("--edge-to", toV);
  }
}

function edgeYFromProgress(p, from, start, to) {
  if (p <= 0) return from;
  if (p >= 1) return to;
  if (p < 0.12) return from + (p / 0.12) * (start - from);
  return start + ((p - 0.12) / 0.88) * (to - start);
}

function fitEdgeTitles() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const vh = window.innerHeight || 1;
  const preferredTravel = Math.min(vh * 0.08, 4.5 * rem);
  const minTravel = Math.min(vh * 0.03, 1.6 * rem);
  const innerPad = 0.35 * rem;

  document.querySelectorAll(".edge-title").forEach((el) => {
    el.style.removeProperty("font-size");
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") {
      applyEdgeTravel(el, 0, 0, 0);
      return;
    }
    const well = el.clientHeight;
    if (!(well > 1)) {
      applyEdgeTravel(el, 0, 0, 0);
      return;
    }
    const room = Math.max(0, well - 2 * innerPad);
    const baseSize = parseFloat(cs.fontSize);
    const baseLen = titleGlyphSpan(el);
    if (!(baseSize > 0) || !(baseLen > 0) || !(room > 0)) {
      applyEdgeTravel(el, 0, 0, 0);
      return;
    }

    let travel = Math.min(preferredTravel, room * 0.28);
    let size = baseSize;
    if (baseLen + travel > room) {
      const sized = baseSize * ((room - travel) / baseLen);
      const floor = 1.35 * rem;
      if (sized >= floor) {
        size = sized;
      } else {
        const lenAtFloor = baseLen * (floor / baseSize);
        travel = room - lenAtFloor;
        if (travel >= minTravel) {
          size = floor;
        } else {
          travel = Math.min(minTravel, Math.max(0, room * 0.1));
          size = baseSize * Math.max(0.01, (room - travel) / baseLen);
        }
      }
    }

    el.style.fontSize = size + "px";
    const actual = titleGlyphSpan(el);
    if (actual > 0 && actual + travel > room) {
      const corr = (room - travel) / actual;
      if (corr > 0 && corr < 0.999) {
        size *= corr;
        el.style.fontSize = size + "px";
      }
    }

    const half = travel / 2;
    applyEdgeTravel(el, half * 1.15, 0, -half);
  });
}

function setupEdgeTitles() {
  if (!document.querySelector(".edge-title")) return fitEdgeTitles;
  let raf = 0;
  const requestFit = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fitEdgeTitles();
    });
  };
  fitEdgeTitles();
  requestFit();
  window.addEventListener("resize", requestFit, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", requestFit, { passive: true });
  }
  if (document.fonts) {
    document.fonts.ready.then(requestFit).catch(() => {});
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", requestFit);
    }
  }
  return requestFit;
}

function setupPinFallback() {
  if (reduceMq.matches) return;
  const tracks = [...document.querySelectorAll("[data-pin]")];
  const reveals = [...document.querySelectorAll("[data-reveal]")];
  if (!tracks.length && !reveals.length) return;

  const sda = supportsScrollTimelines();
  if (sda) {
    document.documentElement.classList.add("sda");
  } else {
    document.documentElement.classList.add("has-motion-js");
  }

  const active = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) active.add(e.target);
        else active.delete(e.target);
      }
    },
    { rootMargin: "10% 0px 10% 0px", threshold: 0 }
  );
  tracks.forEach((t) => io.observe(t));
  reveals.forEach((t) => io.observe(t));

  let ticking = false;
  const root = document.documentElement;

  const update = (now = performance.now()) => {
    ticking = false;
    if (document.documentElement.classList.contains("is-snapping")) return;
    const vh = window.innerHeight || 1;
    sampleScrollVel(now);

    if (!sda) {
      for (const track of tracks) {
        if (!active.has(track) && track.style.getPropertyValue("--arrive") === "") continue;
        const p = coverProgress(track, vh);
        const arrive = arriveFromProgress(p);
        const panel = track.querySelector(".pin-panel");
        if (p < -0.05 || p > 1.05) {
          if (panel) panel.classList.remove("is-live");
          continue;
        }
        const copyY = p < 0.18
          ? (((0.18 - p) / 0.18) * 1.6).toFixed(2) + "rem"
          : p > 0.9
            ? (((p - 0.9) / 0.1) * -0.4).toFixed(2) + "rem"
            : "0px";
        track.style.setProperty("--arrive", arrive.toFixed(3));
        track.style.setProperty("--copy-y", copyY);
        track.style.setProperty("--visual-y", (8 - p * 14).toFixed(2) + "%");
        track.style.setProperty("--visual-scale", (1.02 + p * 0.06).toFixed(3));
        const edgeFrom = parseFloat(track.style.getPropertyValue("--edge-from")) || 0;
        const edgeStart = parseFloat(track.style.getPropertyValue("--edge-start")) || 0;
        const edgeTo = parseFloat(track.style.getPropertyValue("--edge-to")) || 0;
        track.style.setProperty("--edge-y", edgeYFromProgress(p, edgeFrom, edgeStart, edgeTo).toFixed(1) + "px");
        track.style.setProperty("--edge-o", arrive > 0.12 ? "0.22" : (arrive * 1.8).toFixed(3));
        if (panel) panel.classList.toggle("is-live", arrive > 0.16);
      }
      for (const el of reveals) {
        if (active.has(el)) el.classList.add("is-in");
      }
    } else {
      for (const track of tracks) {
        const panel = track.querySelector(".pin-panel");
        if (!panel) continue;
        const p = coverProgress(track, vh);
        const arrive = arriveFromProgress(p);
        panel.classList.toggle("is-live", arrive > 0.16);
      }
    }
  };

  const requestTick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick, { passive: true });
  requestTick();
}

function setupCursorGlow() {
  if (reduceMq.matches || !finePointer.matches) return;
  const root = document.documentElement;
  let x = innerWidth / 2;
  let y = innerHeight / 3;
  let raf = 0;
  const flush = () => {
    raf = 0;
    root.style.setProperty("--mx", x + "px");
    root.style.setProperty("--my", y + "px");
  };
  const onMove = (e) => {
    x = e.clientX;
    y = e.clientY;
    root.classList.add("has-glow");
    if (!raf) raf = requestAnimationFrame(flush);
  };
  window.addEventListener("pointermove", onMove, { passive: true });
}

function setupFireflies() {
  const canvas = document.querySelector("canvas.fireflies");
  if (!canvas || reduceMq.matches) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  const N = 22;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let running = false;
  let last = 0;
  const TAU = 0.85;
  const flies = Array.from({ length: N }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + (i % 5) * 0.35,
    s: 0.015 + (i % 7) * 0.004,
    a: Math.random() * Math.PI * 2,
    wiggle: 0.4 + (i % 4) * 0.25,
    cyan: i % 5 === 0,
    mass: 0.58 + (i % 9) * 0.09,
    vx: 0,
    vy: 0,
  }));

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const tick = (t) => {
    if (!running) return;
    if (document.documentElement.classList.contains("is-snapping")) {
      requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(48, t - last || 16);
    last = t;
    const dtSec = dt / 1000;
    const inst = sampleScrollVel(t);
    const scrolling = Math.abs(inst) > 0.02;
    ctx.clearRect(0, 0, w, h);
    for (const f of flies) {
      if (scrolling) {
        const target = inst / f.mass;
        const follow = 1 - Math.exp(-dtSec / 0.06);
        f.vy += (target - f.vy) * follow;
        f.vx += inst * 0.05 * (f.wiggle - 0.65) * follow;
      }
      const decay = Math.exp(-dtSec / TAU);
      f.vy *= decay;
      f.vx *= decay;
      if (f.vy > SCROLL_VEL_CAP) f.vy = SCROLL_VEL_CAP;
      else if (f.vy < -SCROLL_VEL_CAP) f.vy = -SCROLL_VEL_CAP;
      if (f.vx > SCROLL_VEL_CAP * 0.4) f.vx = SCROLL_VEL_CAP * 0.4;
      else if (f.vx < -SCROLL_VEL_CAP * 0.4) f.vx = -SCROLL_VEL_CAP * 0.4;

      const speed = Math.hypot(f.vx, f.vy);
      const streak = Math.min(1, speed / 1.25);
      f.a += f.s * (0.02 + streak * 0.05) * dt;
      f.x += Math.cos(f.a) * f.s * 0.00035 * dt + (f.vx * dt) / Math.max(w, 1);
      f.y += Math.sin(f.a * f.wiggle) * f.s * 0.00028 * dt + (f.vy * dt) / Math.max(h, 1);
      if (f.x < -0.05) f.x = 1.05;
      if (f.x > 1.05) f.x = -0.05;
      if (f.y < -0.08) f.y = 1.08;
      if (f.y > 1.08) f.y = -0.08;
      const px = f.x * w;
      const py = f.y * h;
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.0018 + f.a));
      const radius = f.r * 9 * (1 + streak * 0.35);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, 1 + streak * 4.2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      if (f.cyan) {
        g.addColorStop(0, `rgba(235,235,235,${0.7 * pulse})`);
        g.addColorStop(0.25, `rgba(175,175,175,${0.22 * pulse})`);
        g.addColorStop(1, "rgba(175,175,175,0)");
      } else {
        g.addColorStop(0, `rgba(220,220,220,${0.75 * pulse})`);
        g.addColorStop(0.22, `rgba(170,170,170,${0.25 * pulse})`);
        g.addColorStop(1, "rgba(150,150,150,0)");
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!document.hidden && !reduceMq.matches) requestAnimationFrame(tick);
  };

  const play = () => {
    if (running || document.hidden || reduceMq.matches) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    ctx.clearRect(0, 0, w, h);
  };

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : play()));
  window.addEventListener("resize", resize, { passive: true });
  resize();
  play();
}


function setupLangSwitcher() {
  const nav = document.querySelector(".lang-switch");
  if (!nav) return;
  const btn = nav.querySelector(".lang-switch-btn");
  const menu = nav.querySelector(".lang-menu");
  const closeBtn = nav.querySelector(".lang-menu-close");
  if (!btn || !menu) return;
  const items = () => [...menu.querySelectorAll("[data-lang-option]")];

  const isOpen = () => btn.getAttribute("aria-expanded") === "true";

  const setOpen = (open, { restore = true } = {}) => {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("lang-menu-open", open);
    if (open) {
      const current = menu.querySelector("[aria-current='true']") || items()[0];
      current?.focus();
    } else if (restore) {
      btn.focus();
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });
  closeBtn?.addEventListener("click", () => setOpen(false));

  menu.addEventListener("click", (e) => {
    if (e.target === menu) setOpen(false);
  });

  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (!nav.contains(e.target)) setOpen(false, { restore: false });
  });

  nav.addEventListener("keydown", (e) => {
    const list = items();
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isOpen() && document.activeElement === btn) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!isOpen()) return;
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(Math.max(i, 0) + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i <= 0 ? list.length : i) - 1]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    }
  });

  document.addEventListener("focusin", (e) => {
    if (isOpen() && !nav.contains(e.target)) setOpen(false, { restore: false });
  });
}


function setupMobileNav() {
  const chrome = document.querySelector(".site-chrome") || document.querySelector(".site-header");
  const btn = document.querySelector(".nav-toggle");
  const menu = document.getElementById("site-menu");
  if (!chrome || !btn || !menu) return;

  const setOpen = (open) => {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("nav-open", open);
    chrome.classList.toggle("is-open", open);
    if (open) {
      const first = menu.querySelector(".nav a, [data-lang-option]");
      first?.focus();
    } else {
      btn.focus();
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
      e.preventDefault();
      setOpen(false);
    }
  });

  menu.querySelector(".nav")?.addEventListener("click", (e) => {
    if (e.target.closest("a") && window.matchMedia("(max-width: 699px)").matches) {
      setOpen(false);
    }
  });
}

const TITLE_MASK_SELECTOR = ".hero h1, .display-title, .page-title, .edge-title";

function createTitleMask() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const measure = document.createElement("canvas").getContext("2d");
  let cssW = 0;
  let cssH = 0;
  let maskScale = 1;
  let chCache = new WeakMap();

  const typographyKey = (cs) =>
    [
      cs.font,
      cs.fontSize,
      cs.fontFamily,
      cs.fontWeight,
      cs.fontStyle,
      cs.fontStretch,
      cs.letterSpacing,
      cs.fontVariationSettings,
      cs.textTransform,
    ].join("\0");

  const fontFrom = (cs) => {
    if (cs.font && cs.font !== "inherit") return cs.font;
    return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  };

  const typicalCharWidth = (el, cs) => {
    const key = typographyKey(cs);
    const hit = chCache.get(el);
    if (hit && hit.key === key) return hit.ch;
    if (measure) {
      measure.font = fontFrom(cs);
      if ("letterSpacing" in measure) measure.letterSpacing = "0px";
    }
    let ch = measure ? measure.measureText("0").width : 0;
    if (!(ch > 0) && measure) ch = measure.measureText("n").width;
    if (!(ch > 0)) ch = parseFloat(cs.fontSize) * 0.5 || 8;
    chCache.set(el, { key, ch });
    return ch;
  };

  const effectiveOpacity = (el) => {
    let o = 1;
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      const op = parseFloat(cs.opacity);
      if (Number.isFinite(op)) o *= op;
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      n = n.parentElement;
    }
    return o;
  };

  const renderedChar = (ch, transform) => {
    if (transform === "uppercase") return ch.toLocaleUpperCase();
    if (transform === "lowercase") return ch.toLocaleLowerCase();
    return ch;
  };

  const glyphAngle = (cs) => {
    let angle = 0;
    const wm = cs.writingMode || "horizontal-tb";
    const orient = cs.textOrientation || "mixed";
    if (wm === "vertical-rl" || wm === "vertical-lr" || wm === "sideways-rl" || wm === "sideways-lr") {
      if (orient === "mixed" || orient === "sideways") angle += Math.PI / 2;
    }
    if (cs.rotate && cs.rotate !== "none") {
      const m = String(cs.rotate).match(/(-?[\d.]+)/);
      if (m) angle += (parseFloat(m[1]) * Math.PI) / 180;
    }
    if (cs.transform && cs.transform !== "none") {
      try {
        const m = new DOMMatrix(cs.transform);
        angle += Math.atan2(m.b, m.a);
      } catch {
        /* ignore unparsable transform */
      }
    }
    return angle;
  };

  const drawTitle = (el) => {
    if (!ctx) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const op = effectiveOpacity(el);
    if (op < 0.02) return;
    const box = el.getBoundingClientRect();
    const ox = typicalCharWidth(el, cs) / 3;
    const oy = ox;
    const pad = ox + 4;
    if (box.right + ox < -pad || box.bottom + oy < -pad || box.left + ox > cssW + pad || box.top + oy > cssH + pad) return;

    const transform = cs.textTransform || "none";
    const angle = glyphAngle(cs);
    const maskA = op < 0.12 ? op / 0.12 : 1;

    const svg = el.querySelector("svg");
    if (svg) {
      const gbox = svg.getBoundingClientRect();
      if (gbox.width >= 0.2 && gbox.height >= 0.2) {
        const vb = svg.viewBox && svg.viewBox.baseVal;
        if (vb && vb.width && vb.height) {
          ctx.save();
          ctx.fillStyle = `rgba(255,255,255,${maskA})`;
          ctx.translate(gbox.left + ox, gbox.top + oy);
          ctx.scale(gbox.width / vb.width, gbox.height / vb.height);
          ctx.translate(-vb.x, -vb.y);
          svg.querySelectorAll("path").forEach((path) => {
            const d = path.getAttribute("d");
            if (!d) return;
            try {
              ctx.fill(new Path2D(d), "nonzero");
            } catch (_err) {
              /* malformed path */
            }
          });
          ctx.restore();
        }
      }
      return;
    }

    ctx.save();
    ctx.font = fontFrom(cs);
    ctx.fillStyle = `rgba(255,255,255,${maskA})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    if ("fontKerning" in ctx) ctx.fontKerning = "none";
    if ("fontVariationSettings" in ctx && cs.fontVariationSettings && cs.fontVariationSettings !== "normal") {
      ctx.fontVariationSettings = cs.fontVariationSettings;
    }

    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue || "";
      for (let i = 0; i < raw.length; i++) {
        if (!raw[i].trim()) continue;
        const ch = renderedChar(raw[i], transform);
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 0.2 || r.height < 0.2) continue;
        if (r.right + ox < 0 || r.bottom + oy < 0 || r.left + ox > cssW || r.top + oy > cssH) continue;
        const cx = r.left + ox + r.width / 2;
        const cy = r.top + oy + r.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        if (angle) ctx.rotate(angle);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  const rebuild = () => {
    if (!cssW || !cssH || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(maskScale, 0, 0, maskScale, 0, 0);
    ctx.filter = "blur(1.5px)";
    document.querySelectorAll(TITLE_MASK_SELECTOR).forEach(drawTitle);
    ctx.filter = "none";
  };

  return {
    canvas,
    resize(nextCssW, nextCssH) {
      cssW = Math.max(1, nextCssW);
      cssH = Math.max(1, nextCssH);
      chCache = new WeakMap();
      maskScale = 1;
      const nw = Math.max(1, Math.round(cssW * maskScale));
      const nh = Math.max(1, Math.round(cssH * maskScale));
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
      }
    },
    update() {
      rebuild();
      return canvas;
    },
  };
}


function setupPaintTrail() {
  if (reduceMq.matches) return;
  let canvas = document.querySelector("canvas.paint-trail");
  if (!canvas) return;

  const HOLD_MS = 500;
  const GAIN_UP = 0.4;
  const TEX_FADE = 2.5;
  const STAMP_SCALE = 0.7;
  const GAIN_EPS = 0.008;
  const LAYER_CAP = 0.7;
  const SPEED_LO = 40;
  const SPEED_HI = 500;
  const DECAY_TAU = 3.2;
  const ENERGY_EPS = 1 / 512;
  const DECAY_SUB = 1 / 255;
  const DECAY_BASE = 0.99;
  const DECAY_BASE_HZ = 120;
  const MAX_BYTES = 64 * 1024 * 1024;
  const RESIZE_DEBOUNCE = 150;

  let w = 0;
  let visH = 0;
  let tileH = 0;
  let scale = 1;
  let running = false;
  let last = 0;
  let lastScrollY = window.scrollY || 0;
  let contentY = lastScrollY;
  let lastRefKey = "";
  let lastRefTop = 0;
  let lastInput = 0;
  let envelope = 0;
  let px = window.innerWidth / 2;
  let py = window.innerHeight / 3;
  let lastDocX = px;
  let lastDocY = py + contentY;
  let hasPoint = false;
  let hasStamp = false;
  let stampX = lastDocX;
  let stampY = lastDocY;
  let inputFrame = false;
  let layerOp = LAYER_CAP;
  let fadingLayer = false;
  let fadeStartOp = LAYER_CAP;
  let fadeT = 0;
  let resizeTimer = 0;

  const stampRadiusCss = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return 11 * rem * STAMP_SCALE;
  };

  const smoothstep = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  // CSS ease-in: cubic-bezier(0.42, 0, 1, 1)
  const easeIn = (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xt = 1.26 * t + 0.48 * t * t - 0.74 * t * t * t;
      const dxt = 1.26 + 0.96 * t - 2.22 * t * t;
      if (Math.abs(dxt) < 1e-6) break;
      t -= (xt - x) / dxt;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    return 3 * t * t - 2 * t * t * t;
  };

  const setLayerOp = (v) => {
    layerOp = Math.max(0, Math.min(LAYER_CAP, v));
    canvas.style.opacity = String(layerOp);
  };

  const resetTrailState = () => {
    envelope = 0;
    fadingLayer = false;
    fadeT = 0;
    hasStamp = false;
    setLayerOp(LAYER_CAP);
  };

  const contentRef = () => {
    const vh = window.innerHeight || 1;
    const panels = document.querySelectorAll(".pin-panel");
    let best = null;
    let bestKey = "scroll";
    let bestCover = 0;
    let i = 0;
    for (const panel of panels) {
      const r = panel.getBoundingClientRect();
      const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (vis > bestCover) {
        bestCover = vis;
        best = r;
        bestKey = panel.id ? "pin:" + panel.id : "pin:" + i;
      }
      i += 1;
    }
    if (best && bestCover > 1) {
      return { key: bestKey, top: best.top };
    }
    return { key: "scroll", top: -(window.scrollY || 0) };
  };

  const adoptContentRef = () => {
    const ref = contentRef();
    lastRefKey = ref.key;
    lastRefTop = ref.top;
  };

  // Content-space Y tracks visible motion, not raw scrollY. While a pin-panel
  // stays put on screen, contentY holds; when the panel (or the page) moves,
  // it advances 1:1. Switching the reference does not add a jump.
  const syncContentY = (reset) => {
    const ref = contentRef();
    if (reset || !lastRefKey) {
      contentY = window.scrollY || 0;
      lastRefKey = ref.key;
      lastRefTop = ref.top;
      return;
    }
    if (ref.key !== lastRefKey) {
      lastRefKey = ref.key;
      lastRefTop = ref.top;
      return;
    }
    contentY += lastRefTop - ref.top;
    lastRefTop = ref.top;
  };

  const viewTopPx = () => Math.round(contentY * scale);

  const compile = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(log || "shader compile failed");
    }
    return sh;
  };

  const programOf = (gl, vsSrc, fsSrc) => {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(log || "program link failed");
    }
    const loc = (name) => gl.getUniformLocation(prog, name);
    return {
      prog,
      uRect: loc("uRect"),
      uSize: loc("uSize"),
      uUvRect: loc("uUvRect"),
      uTex: loc("uTex"),
      uCenter: loc("uCenter"),
      uRadius: loc("uRadius"),
      uGain: loc("uGain"),
      uKeep: loc("uKeep"),
      uSub: loc("uSub"),
      uThreshold: loc("uThreshold"),
      uGrey: loc("uGrey"),
      uChan: loc("uChan"),
      uMask: loc("uMask"),
      uUseMask: loc("uUseMask"),
    };
  };

  const glsl = (is2, kind) => {
    const v2 = `#version 300 es
in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uSize;
uniform vec4 uUvRect;
out vec2 vPx;
out vec2 vUv;
void main() {
  vec2 px = mix(uRect.xy, uRect.zw, aPos);
  vPx = px;
  vUv = vec2(mix(uUvRect.x, uUvRect.z, aPos.x), 1.0 - mix(uUvRect.y, uUvRect.w, aPos.y));
  gl_Position = vec4(px.x / uSize.x * 2.0 - 1.0, 1.0 - px.y / uSize.y * 2.0, 0.0, 1.0);
}`;
    const v1 = `
attribute vec2 aPos;
uniform vec4 uRect;
uniform vec2 uSize;
uniform vec4 uUvRect;
varying vec2 vPx;
varying vec2 vUv;
void main() {
  vec2 px = mix(uRect.xy, uRect.zw, aPos);
  vPx = px;
  vUv = vec2(mix(uUvRect.x, uUvRect.z, aPos.x), 1.0 - mix(uUvRect.y, uUvRect.w, aPos.y));
  gl_Position = vec4(px.x / uSize.x * 2.0 - 1.0, 1.0 - px.y / uSize.y * 2.0, 0.0, 1.0);
}`;
    if (kind === "vs") return is2 ? v2 : v1;
    if (kind === "stamp") {
      return is2 ? `#version 300 es
precision highp float;
in vec2 vPx;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uGain;
out vec4 fragColor;
void main() {
  float t = length(vPx - uCenter) / max(uRadius, 0.0001);
  if (t >= 1.0) discard;
  float a = t < 0.3 ? mix(0.32, 0.12, t / 0.3) : mix(0.12, 0.0, (t - 0.3) / 0.7);
  a *= uGain;
  fragColor = vec4(a, a, a, a);
}` : `
precision highp float;
varying vec2 vPx;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uGain;
void main() {
  float t = length(vPx - uCenter) / max(uRadius, 0.0001);
  if (t >= 1.0) discard;
  float a = t < 0.3 ? mix(0.32, 0.12, t / 0.3) : mix(0.12, 0.0, (t - 0.3) / 0.7);
  a *= uGain;
  gl_FragColor = vec4(a, a, a, a);
}`;
    }
    if (kind === "filter") {
      return is2 ? `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uKeep;
uniform float uSub;
uniform float uThreshold;
uniform float uChan;
out vec4 fragColor;
void main() {
  vec4 s = texture(uTex, vUv);
  float v = mix(s.r, s.a, uChan);
  v = v * uKeep - uSub;
  if (v < uThreshold) v = 0.0;
  fragColor = vec4(v, v, v, v);
}` : `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uKeep;
uniform float uSub;
uniform float uThreshold;
uniform float uChan;
void main() {
  vec4 s = texture2D(uTex, vUv);
  float v = mix(s.r, s.a, uChan);
  v = v * uKeep - uSub;
  if (v < uThreshold) v = 0.0;
  gl_FragColor = vec4(v, v, v, v);
}`;
    }
    return is2 ? `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vPx;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uGrey;
uniform float uChan;
uniform float uUseMask;
uniform vec2 uSize;
out vec4 fragColor;
void main() {
  vec4 s = texture(uTex, vUv);
  float v = mix(s.r, s.a, uChan);
  if (uUseMask > 0.5 && uSize.x > 0.0 && uSize.y > 0.0) {
    float m = texture(uMask, vec2(vPx.x / uSize.x, vPx.y / uSize.y)).a;
    v *= (1.0 - m);
  }
  if (v <= 0.0) discard;
  fragColor = vec4(vec3(uGrey * v), v);
}` : `
precision highp float;
varying vec2 vUv;
varying vec2 vPx;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uGrey;
uniform float uChan;
uniform float uUseMask;
uniform vec2 uSize;
void main() {
  vec4 s = texture2D(uTex, vUv);
  float v = mix(s.r, s.a, uChan);
  if (uUseMask > 0.5 && uSize.x > 0.0 && uSize.y > 0.0) {
    float m = texture2D(uMask, vec2(vPx.x / uSize.x, vPx.y / uSize.y)).a;
    v *= (1.0 - m);
  }
  if (v <= 0.0) discard;
  gl_FragColor = vec4(vec3(uGrey * v), v);
}`;
  };

  const probeFormat = (gl, is2) => {
    const candidates = [];
    if (is2) {
      const half = gl.getExtension("EXT_color_buffer_half_float");
      const flt = gl.getExtension("EXT_color_buffer_float");
      // Prefer half-float when it is renderable and blendable; else 8-bit R8.
      if ((half || flt) && gl.R16F && gl.HALF_FLOAT) {
        candidates.push({ name: "R16F", bpp: 2, chan: 0, internal: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT });
      }
      candidates.push({ name: "R8", bpp: 1, chan: 0, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE });
    } else {
      candidates.push({ name: "LUMINANCE", bpp: 1, chan: 0, internal: gl.LUMINANCE, format: gl.LUMINANCE, type: gl.UNSIGNED_BYTE });
      candidates.push({ name: "ALPHA", bpp: 1, chan: 1, internal: gl.ALPHA, format: gl.ALPHA, type: gl.UNSIGNED_BYTE });
    }
    const check = (fmt) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, 8, 8, 0, fmt.format, fmt.type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ok) {
        const vsSrc = is2
          ? "#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }"
          : "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";
        const fsSrc = is2
          ? "#version 300 es\nprecision highp float; out vec4 c; void main(){ c = vec4(0.2); }"
          : "precision highp float; void main(){ gl_FragColor = vec4(0.2); }";
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSrc);
        gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSrc);
        gl.compileShader(fs);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, "a");
        gl.linkProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        while (gl.getError() !== gl.NO_ERROR) {}
        gl.viewport(0, 0, 8, 8);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        gl.useProgram(prog);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const err = gl.getError();
        ok = gl.getProgramParameter(prog, gl.LINK_STATUS)
          && err === gl.NO_ERROR
          && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.disable(gl.BLEND);
        gl.useProgram(null);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      return ok;
    };
    for (const fmt of candidates) {
      try {
        if (check(fmt)) return fmt;
      } catch (err) { /* format not supported */ }
    }
    return null;
  };

  const makeTex = (gl, fmt, tw, th) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, tw, th, 0, fmt.format, fmt.type, null);
    return tex;
  };

  const createTrailGL = (target) => {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 8;
    const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
    let is2 = true;
    let probeGl = probe.getContext("webgl2", attrs);
    if (!probeGl) {
      is2 = false;
      probeGl = probe.getContext("webgl", attrs) || probe.getContext("experimental-webgl", attrs);
    }
    if (!probeGl) return null;
    const fmt = probeFormat(probeGl, is2);
    let probeOk = false;
    if (fmt) {
      try {
        programOf(probeGl, glsl(is2, "vs"), glsl(is2, "stamp"));
        programOf(probeGl, glsl(is2, "vs"), glsl(is2, "filter"));
        programOf(probeGl, glsl(is2, "vs"), glsl(is2, "present"));
        probeOk = true;
      } catch (err) {
        probeOk = false;
      }
    }
    const lose = probeGl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    if (!fmt || !probeOk) return null;

    const gl = is2
      ? target.getContext("webgl2", attrs)
      : (target.getContext("webgl", attrs) || target.getContext("experimental-webgl", attrs));
    if (!gl) return null;
    if (is2) {
      gl.getExtension("EXT_color_buffer_half_float");
      gl.getExtension("EXT_color_buffer_float");
    }
    const liveFmt = probeFormat(gl, is2) || fmt;

    let stampProg;
    let filterProg;
    let presentProg;
    let quad;
    let scratchTex = null;
    let scratchFbo = null;
    try {
      stampProg = programOf(gl, glsl(is2, "vs"), glsl(is2, "stamp"));
      filterProg = programOf(gl, glsl(is2, "vs"), glsl(is2, "filter"));
      presentProg = programOf(gl, glsl(is2, "vs"), glsl(is2, "present"));
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    } catch (err) {
      return { __boundFailed: true };
    }

    const tiles = new Map();
    let tw = 0;
    let th = 0;
    let maskTex = null;
    let maskW = 0;
    let maskH = 0;

    const bindQuad = (prog) => {
      gl.useProgram(prog.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    };

    const setRect = (prog, x0, y0, x1, y1, sizeW, sizeH, uvx0, uvy0, uvx1, uvy1) => {
      gl.uniform4f(prog.uRect, x0, y0, x1, y1);
      gl.uniform2f(prog.uSize, sizeW, sizeH);
      gl.uniform4f(prog.uUvRect, uvx0, uvy0, uvx1, uvy1);
    };

    const resizeScratch = (nw, nh) => {
      if (scratchTex) {
        gl.deleteTexture(scratchTex);
        gl.deleteFramebuffer(scratchFbo);
        scratchTex = null;
        scratchFbo = null;
      }
      if (!nw || !nh) return;
      scratchTex = makeTex(gl, liveFmt, nw, nh);
      scratchFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, scratchFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scratchTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const discardTile = (index) => {
      const tile = tiles.get(index);
      if (!tile) return;
      gl.deleteTexture(tile.tex);
      gl.deleteFramebuffer(tile.fbo);
      tiles.delete(index);
    };

    const drawFilter = (srcTex, destFbo, destW, destH, keep, sub, floor) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);
      gl.viewport(0, 0, destW, destH);
      gl.disable(gl.BLEND);
      bindQuad(filterProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(filterProg.uTex, 0);
      gl.uniform1f(filterProg.uKeep, keep);
      gl.uniform1f(filterProg.uSub, sub);
      gl.uniform1f(filterProg.uThreshold, floor);
      gl.uniform1f(filterProg.uChan, liveFmt.chan);
      setRect(filterProg, 0, 0, destW, destH, destW, destH, 0, 0, 1, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    return {
      name: (is2 ? "webgl2" : "webgl1") + "-" + liveFmt.name,
      bytesPerPixel: liveFmt.bpp,
      hasTile: (i) => tiles.has(i),
      getEnergy: (i) => (tiles.get(i) ? tiles.get(i).energy : 0),
      tileCount: () => tiles.size,
      forEachIndex: (fn) => { for (const i of tiles.keys()) fn(i); },
      discardTile,
      discardAll: () => { for (const i of [...tiles.keys()]) discardTile(i); },
      resize: (nw, nh) => {
        tw = nw;
        th = nh;
        resizeScratch(nw, nh);
      },
      ensureTile: (index) => {
        let tile = tiles.get(index);
        if (tile) return tile;
        const tex = makeTex(gl, liveFmt, tw, th);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.viewport(0, 0, tw, th);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        tile = { tex, fbo, energy: 0 };
        tiles.set(index, tile);
        return tile;
      },
      stampOnTile: (index, localX, localY, radius, gain) => {
        const tile = tiles.get(index);
        if (!tile) return;
        const x0 = Math.max(0, localX - radius);
        const y0 = Math.max(0, localY - radius);
        const x1 = Math.min(tw, localX + radius);
        const y1 = Math.min(th, localY + radius);
        if (x0 >= x1 || y0 >= y1) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, tile.fbo);
        gl.viewport(0, 0, tw, th);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        bindQuad(stampProg);
        gl.uniform2f(stampProg.uCenter, localX, localY);
        gl.uniform1f(stampProg.uRadius, radius);
        gl.uniform1f(stampProg.uGain, gain);
        setRect(stampProg, x0, y0, x1, y1, tw, th, 0, 0, 1, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        tile.energy = 1;
      },
      decay: (keep, sub, floor) => {
        const is16 = liveFmt.name === "R16F";
        const useSub = sub == null ? (is16 ? 0 : DECAY_SUB) : sub;
        const useFloor = floor == null ? 0 : floor;
        const doomed = [];
        for (const [index, tile] of tiles) {
          if (!scratchTex || !scratchFbo) break;
          drawFilter(tile.tex, scratchFbo, tw, th, keep, useSub, useFloor);
          drawFilter(scratchTex, tile.fbo, tw, th, 1, 0, 0);
          tile.energy *= keep;
          if (tile.energy < ENERGY_EPS) doomed.push(index);
        }
        for (const index of doomed) discardTile(index);
      },
      present: (viewTop, maskCanvas) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, tw, visH);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!tiles.size || !tileH) return;
        const viewBot = viewTop + visH;
        const i0 = Math.floor(viewTop / tileH);
        const i1 = Math.floor((viewBot - 1) / tileH);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        bindQuad(presentProg);
        gl.uniform1i(presentProg.uTex, 0);
        gl.uniform1f(presentProg.uGrey, 220 / 255);
        gl.uniform1f(presentProg.uChan, liveFmt.chan);
        const useMask = !!(maskCanvas && maskCanvas.width && maskCanvas.height);
        if (presentProg.uUseMask) gl.uniform1f(presentProg.uUseMask, useMask ? 1 : 0);
        if (useMask && presentProg.uMask) {
          gl.activeTexture(gl.TEXTURE1);
          if (!maskTex) {
            maskTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, maskTex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          } else {
            gl.bindTexture(gl.TEXTURE_2D, maskTex);
          }
          if (maskW !== maskCanvas.width || maskH !== maskCanvas.height) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
            maskW = maskCanvas.width;
            maskH = maskCanvas.height;
          } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
          }
          gl.uniform1i(presentProg.uMask, 1);
        }
        gl.activeTexture(gl.TEXTURE0);
        for (let i = i0; i <= i1; i++) {
          const tile = tiles.get(i);
          if (!tile) continue;
          const tileTop = i * tileH;
          const srcY = Math.max(0, viewTop - tileTop);
          const destY = Math.max(0, tileTop - viewTop);
          const srcH = Math.min(tileH - srcY, visH - destY);
          if (srcH <= 0) continue;
          gl.bindTexture(gl.TEXTURE_2D, tile.tex);
          setRect(
            presentProg,
            0, destY, tw, destY + srcH,
            tw, visH,
            0, srcY / tileH, 1, (srcY + srcH) / tileH
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.disable(gl.BLEND);
      },
    };
  };

  const createTrail2D = (target) => {
    const ctx = target.getContext("2d", { alpha: true });
    if (!ctx) return null;
    const tiles = new Map();
    let tw = 0;
    let th = 0;
    const discardTile = (index) => {
      const tile = tiles.get(index);
      if (!tile) return;
      tile.canvas.width = 0;
      tile.canvas.height = 0;
      tiles.delete(index);
    };
    return {
      name: "canvas2d-rgba",
      bytesPerPixel: 4,
      hasTile: (i) => tiles.has(i),
      getEnergy: (i) => (tiles.get(i) ? tiles.get(i).energy : 0),
      tileCount: () => tiles.size,
      forEachIndex: (fn) => { for (const i of tiles.keys()) fn(i); },
      discardTile,
      discardAll: () => { for (const i of [...tiles.keys()]) discardTile(i); },
      resize: (nw, nh) => { tw = nw; th = nh; },
      ensureTile: (index) => {
        let tile = tiles.get(index);
        if (tile) return tile;
        const off = document.createElement("canvas");
        off.width = tw;
        off.height = th;
        const tctx = off.getContext("2d", { alpha: true });
        if (!tctx) return null;
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.clearRect(0, 0, tw, th);
        tile = { canvas: off, ctx: tctx, energy: 0 };
        tiles.set(index, tile);
        return tile;
      },
      stampOnTile: (index, localX, localY, radius, gain) => {
        const tile = tiles.get(index);
        if (!tile) return;
        const g = tile.ctx.createRadialGradient(localX, localY, 0, localX, localY, radius);
        g.addColorStop(0, `rgba(220,220,220,${0.32 * gain})`);
        g.addColorStop(0.3, `rgba(180,180,180,${0.12 * gain})`);
        g.addColorStop(1, "rgba(160,160,160,0)");
        tile.ctx.globalCompositeOperation = "source-over";
        tile.ctx.fillStyle = g;
        tile.ctx.beginPath();
        tile.ctx.arc(localX, localY, radius, 0, Math.PI * 2);
        tile.ctx.fill();
        tile.energy = 1;
      },
      decay: (keep, sub, floor) => {
        const useSub = sub == null ? DECAY_SUB : sub;
        const useFloor = floor == null ? 0 : floor;
        const doomed = [];
        for (const [index, tile] of tiles) {
          tile.ctx.globalCompositeOperation = "destination-in";
          tile.ctx.fillStyle = `rgba(0,0,0,${keep})`;
          tile.ctx.fillRect(0, 0, tw, th);
          if (useSub || useFloor) {
            tile.ctx.globalCompositeOperation = "destination-out";
            tile.ctx.fillStyle = `rgba(0,0,0,${useSub + useFloor})`;
            tile.ctx.fillRect(0, 0, tw, th);
          }
          tile.energy *= keep;
          if (tile.energy < ENERGY_EPS) doomed.push(index);
        }
        for (const index of doomed) discardTile(index);
      },
      present: (viewTop, maskCanvas) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.globalCompositeOperation = "copy";
        ctx.clearRect(0, 0, tw, visH);
        if (!tiles.size || !tileH) return;
        const viewBot = viewTop + visH;
        const i0 = Math.floor(viewTop / tileH);
        const i1 = Math.floor((viewBot - 1) / tileH);
        ctx.globalCompositeOperation = "source-over";
        for (let i = i0; i <= i1; i++) {
          const tile = tiles.get(i);
          if (!tile) continue;
          const tileTop = i * tileH;
          const srcY = Math.max(0, viewTop - tileTop);
          const destY = Math.max(0, tileTop - viewTop);
          const srcH = Math.min(tileH - srcY, visH - destY);
          if (srcH > 0) {
            ctx.drawImage(tile.canvas, 0, srcY, tw, srcH, 0, destY, tw, srcH);
          }
        }
        if (maskCanvas && maskCanvas.width && maskCanvas.height) {
          ctx.imageSmoothingEnabled = true;
          ctx.globalCompositeOperation = "destination-out";
          ctx.drawImage(maskCanvas, 0, 0, tw, visH);
          ctx.imageSmoothingEnabled = false;
        }
      },
    };
  };

  let backend = createTrailGL(canvas);
  if (backend && backend.__boundFailed) {
    const fresh = canvas.cloneNode(false);
    if (canvas.parentNode) canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    backend = null;
  }
  if (!backend) backend = createTrail2D(canvas);
  if (!backend) return;
  canvas.dataset.trailBackend = backend.name;
  canvas.dataset.trailBpp = String(backend.bytesPerPixel);

  const evictForRoom = (keep) => {
    const pxPer = w && tileH ? w * tileH : 0;
    const bytesPer = pxPer * backend.bytesPerPixel;
    if (!bytesPer || !backend.tileCount()) return;
    const viewTop = viewTopPx();
    const v0 = Math.floor(viewTop / tileH);
    const v1 = Math.floor((viewTop + visH - 1) / tileH);
    const protect = new Set(keep || []);
    for (let i = v0; i <= v1; i++) protect.add(i);
    const budget = Math.max(protect.size, Math.floor(MAX_BYTES / bytesPer), 1);
    while (backend.tileCount() > budget) {
      let best = null;
      let bestDecayed = false;
      let bestDist = -1;
      const mid = viewTop + visH / 2;
      backend.forEachIndex((index) => {
        if (protect.has(index)) return;
        const decayed = backend.getEnergy(index) < ENERGY_EPS;
        const dist = Math.abs((index + 0.5) * tileH - mid);
        if (
          best == null ||
          (decayed && !bestDecayed) ||
          (decayed === bestDecayed && dist > bestDist)
        ) {
          best = index;
          bestDecayed = decayed;
          bestDist = dist;
        }
      });
      if (best == null) break;
      backend.discardTile(best);
    }
  };

  const titleMask = createTitleMask();

  const present = () => {
    if (!w || !visH) return;
    backend.present(viewTopPx(), titleMask.update());
  };

  const resize = () => {
    const nextScale = window.devicePixelRatio || 1;
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const nextW = Math.max(1, Math.round(cssW * nextScale));
    const nextVisH = Math.max(1, Math.round(cssH * nextScale));
    scale = nextScale;
    w = nextW;
    visH = nextVisH;
    tileH = nextVisH;
    canvas.width = w;
    canvas.height = visH;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    titleMask.resize(cssW, cssH);
    backend.discardAll();
    backend.resize(w, tileH);
    resetTrailState();
    const bytes = w * tileH * backend.bytesPerPixel;
    canvas.dataset.trailTileBytes = String(bytes);
    const sy = window.scrollY || 0;
    lastScrollY = sy;
    syncContentY(true);
    lastDocX = hasPoint ? px : window.innerWidth / 2;
    lastDocY = (hasPoint ? py : window.innerHeight / 3) + contentY;
  };

  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = 0;
      resize();
    }, RESIZE_DEBOUNCE);
  };

  const inViewportX = (cssX) => {
    const mw = document.documentElement.clientWidth || window.innerWidth;
    return cssX > 1 && cssX < mw - 1;
  };

  const resumeFromFade = () => {
    if (!fadingLayer) return;
    const keep = LAYER_CAP > 0 ? layerOp / LAYER_CAP : 0;
    backend.decay(keep, 0, 0);
    setLayerOp(LAYER_CAP);
    fadingLayer = false;
    fadeT = 0;
  };

  const noteInput = () => {
    lastInput = performance.now();
    inputFrame = true;
    resumeFromFade();
    play();
  };

  const onPointer = (e) => {
    if (e.touches && e.touches.length) {
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
    } else if (typeof e.clientX === "number") {
      px = e.clientX;
      py = e.clientY;
    } else {
      return;
    }
    hasPoint = true;
    noteInput();
  };

  const stampAt = (docX, docY, gain) => {
    const x = docX * scale;
    const y = docY * scale;
    const r = stampRadiusCss() * scale;
    if (x + r < 0 || x - r > w) return;
    const i0 = Math.floor((y - r) / tileH);
    const i1 = Math.floor((y + r) / tileH);
    const keep = new Set();
    for (let i = i0; i <= i1; i++) keep.add(i);
    evictForRoom(keep);
    for (let i = i0; i <= i1; i++) {
      if (!backend.ensureTile(i)) continue;
      backend.stampOnTile(i, x, y - i * tileH, r, gain);
    }
  };

  const stampAlong = (x1, y1, gain) => {
    if (!hasStamp) {
      stampAt(x1, y1, gain);
      stampX = x1;
      stampY = y1;
      hasStamp = true;
      return;
    }
    const dx = x1 - stampX;
    const dy = y1 - stampY;
    let dist = Math.hypot(dx, dy);
    const spacing = Math.max(8, stampRadiusCss() * 0.32);
    if (dist < 0.5) return;
    const ux = dx / dist;
    const uy = dy / dist;
    while (dist >= spacing) {
      stampX += ux * spacing;
      stampY += uy * spacing;
      stampAt(stampX, stampY, gain);
      dist -= spacing;
    }
  };

  const finishFade = () => {
    backend.discardAll();
    present();
    resetTrailState();
    stop();
  };

  const tick = (t) => {
    if (!running) return;
    if (document.documentElement.classList.contains("is-snapping")) {
      last = t;
      requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(48, t - last || 16);
    last = t;
    const dtSec = Math.max(0.001, dt / 1000);
    const y = window.scrollY || 0;
    const dScroll = y - lastScrollY;
    lastScrollY = y;
    syncContentY(false);
    if (dScroll) {
      lastInput = t;
      inputFrame = true;
      resumeFromFade();
    }

    const curX = hasPoint ? px : window.innerWidth / 2;
    const curY = hasPoint ? py : window.innerHeight / 3;
    const curDocX = curX + (window.scrollX || 0);
    const curDocY = curY + contentY;
    const pathDist = Math.hypot(curDocX - lastDocX, curDocY - lastDocY);
    const speed = pathDist / dtSec;
    lastDocX = curDocX;
    lastDocY = curDocY;

    const hadInput = inputFrame;
    inputFrame = false;
    const holding = hadInput || t - lastInput < HOLD_MS;

    if (hadInput) {
      envelope = Math.min(1, envelope + (1 - envelope) * (1 - Math.exp(-dtSec / (GAIN_UP * 0.35))));
    }

    const speedGain = smoothstep(SPEED_LO, SPEED_HI, speed);
    const stampGain = envelope * speedGain;

    const keep = Math.pow(DECAY_BASE, dtSec * DECAY_BASE_HZ);
    backend.decay(keep);
    if (hadInput && stampGain > GAIN_EPS && inViewportX(curX)) stampAlong(curDocX, curDocY, stampGain);
    else if (!inViewportX(curX)) hasStamp = false;

    if (!holding) {
      if (!fadingLayer) {
        fadingLayer = true;
        fadeStartOp = layerOp;
        fadeT = 0;
      }
      fadeT += dtSec / TEX_FADE;
      const u = Math.min(1, fadeT);
      setLayerOp(fadeStartOp * (1 - easeIn(u)));
      if (u >= 1) {
        setLayerOp(0);
        finishFade();
        return;
      }
    } else {
      resumeFromFade();
    }

    present();

    if (!document.hidden && !reduceMq.matches) requestAnimationFrame(tick);
    else running = false;
  };

  const play = () => {
    if (running || document.hidden || reduceMq.matches) return;
    running = true;
    last = performance.now();
    const sy = window.scrollY || 0;
    lastScrollY = sy;
    adoptContentRef();
    lastDocX = hasPoint ? px : window.innerWidth / 2;
    lastDocY = (hasPoint ? py : window.innerHeight / 3) + contentY;
    requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (envelope > GAIN_EPS || fadingLayer || layerOp < LAYER_CAP || backend.tileCount()) play();
  });
  window.addEventListener("resize", onResize, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize, { passive: true });
  }
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });
  window.addEventListener("touchmove", onPointer, { passive: true });
  window.addEventListener("scroll", noteInput, { passive: true });
  if (document.fonts) {
    const onFonts = () => { titleMask.resize(window.innerWidth || 1, window.innerHeight || 1); };
    document.fonts.ready.then(onFonts).catch(() => {});
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", onFonts);
    }
  }
  resize();
}



const sceneSnap = {
  active: false,
  fromY: 0,
  toY: 0,
  u: 0,
};

function setupSectionScroll() {
  // The dossier reader is this page inside an iframe (html.is-embed).
  // Never intercept wheel/touch there: the modal must scroll natively.
  if (document.documentElement.classList.contains("is-embed")) {
    const noop = () => {};
    window.__hlSectionScroll = {
      reset: noop,
      get pending() { return 0; },
      get gestureLocked() { return false; },
      get snapping() { return false; },
      get stops() { return [0]; },
      get buttonQueue() { return 0; },
      updateStepButtons: noop,
      get snapFrom() { return 0; },
      get snapTo() { return 0; },
      get snapDur() { return 0; },
      get sceneSnap() { return { active: false, fromY: 0, toY: 0, u: 0 }; },
    };
    return;
  }

  const SNAP_MIN = 900;
  const SNAP_MAX = 1200;
  const MERGE = 48;
  // After a step, leftover trackpad inertia must not count as a new gesture.
  // A new deliberate gesture (delta rising after decay, or a direction change)
  // is accepted as soon as the transition has finished. The lock never waits
  // for a quiet gap and is capped shortly after the snap ends.
  const LOCK_CAP_MS = 480;
  const INERTIA_FLOOR = 6;
  const RISE_MIN = 16;
  const GESTURE_GAP_MS = 320;
  const SLOW_WINDOW_MS = 360;
  const SLOW_STEP_PX = 48;
  const RISE_RATIO = 1.8;
  const SWIPE_THRESHOLD = 10;
  const EDGE_EPS = 8;
  const TALL_SLACK = 64;
  const TALL_EDGE = 0.15;

  let stops = [0];
  let snapping = false;
  let gestureLocked = false;
  let peakAbsDy = 0;
  let lastAbsDy = 0;
  let troughAbsDy = 0;
  let lastWheelDir = 0;
  let inertiaTail = false;
  let innerWheel = false;
  let innerWheelGallery = false;
  let galleryGestureInner = false;
  let lastWheelAt = 0;
  let wheelIdle = true;
  let wheelIdleTimer = 0;
  let slowAcc = 0;
  let slowDir = 0;
  let slowStart = 0;
  let lastSlowAt = 0;
  let gestureSpent = false;
  let touchInner = false;
  let lockCapTimer = 0;
  let lockedUntil = 0;
  let snapFallbackTimer = 0;
  let snapFrom = 0;
  let snapTo = 0;
  let snapT0 = 0;
  let snapDur = SNAP_MIN;
  let touchX0 = 0;
  let touchY0 = 0;
  let touchActive = false;
  let touchStepped = false;
  let touchOnTl = false;
  let scrollbarDrag = false;
  let buttonQueue = 0;

  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const overlayOpen = () =>
    document.body.classList.contains("nav-open") ||
    document.body.classList.contains("lang-menu-open") ||
    document.body.classList.contains("modal-open") ||
    document.body.classList.contains("lightbox-open") ||
    document.documentElement.classList.contains("gate-on");
  const offsetDoc = (el) => Math.round(el.getBoundingClientRect().top + (window.scrollY || 0));
  const hasScenes = () => document.body.classList.contains("has-scenes");
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const eventInModal = (e) => !!(e && e.target && e.target.closest && e.target.closest("[data-hl-modal], .hl-modal, [data-hl-lightbox], .hl-lightbox"));
  // Pop-ups (and non-scene / embed pages): zero filtering, native scroll only.
  const stepperIgnores = (e) =>
    reduceMq.matches || !hasScenes() || overlayOpen() || eventInModal(e);

  const collectStops = () => {
    const sceneTracks = [...document.querySelectorAll(".hero-track, .intro-track, .pin-track, .teaser-track")];
    if (hasScenes() && sceneTracks.length) {
      sceneTracks.forEach((el, i) => el.classList.toggle("is-last-scene", i === sceneTracks.length - 1));
    }
    let max = maxY();
    // After the footer credits went away, a last 170vh pin-track still leaves ~70vh of
    // animation runway. That used to lead into the footer; now it is a second snap
    // onto the same last section. Clamp to the last track's start.
    if (hasScenes() && sceneTracks.length) {
      const lastStart = offsetDoc(sceneTracks[sceneTracks.length - 1]);
      if (Number.isFinite(lastStart)) max = Math.min(max, Math.max(0, lastStart));
    }
    const headerEl = document.querySelector(".site-chrome") || document.querySelector(".site-header");
    const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 56;
    // Merge the document top with the first section sitting just below the sticky header
    // (otherwise 0 and ~54px both become stops, and one "page" step only moves 54px).
    const band = Math.max(MERGE, headerH);
    const ys = [0];
    const add = (y) => {
      ys.push(Math.max(0, Math.min(max, Math.round(y))));
    };
    document.querySelectorAll(".hero-track, .intro-track, .pin-track, .page-intro, .teaser-track, .dossier-section").forEach((el) => add(offsetDoc(el)));
    add(max);
    ys.sort((a, b) => a - b);
    const merged = [];
    for (const y of ys) {
      // Use > (not >=) so a first track that starts exactly one header-height
      // below 0 (typical on mobile, padding-top === --header === 48px) merges
      // with the document top instead of becoming a second stop.
      if (!merged.length || y - merged[merged.length - 1] > band) merged.push(y);
      else if (y === max) merged[merged.length - 1] = max;
    }
    if (merged[merged.length - 1] !== max) {
      if (max - merged[merged.length - 1] > band) merged.push(max);
      else merged[merged.length - 1] = max;
    }
    stops = merged;
  };

  const nextStop = (y) => {
    for (const s of stops) {
      if (s > y + EDGE_EPS) return s;
    }
    return null;
  };
  const prevStop = (y) => {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (stops[i] < y - EDGE_EPS) return stops[i];
    }
    return null;
  };
  const nearestStop = (y) => {
    let best = stops[0] || 0;
    let bestD = Math.abs(y - best);
    for (const s of stops) {
      const d = Math.abs(y - s);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  };
  const nearestIndex = (y) => {
    let best = 0;
    let bestD = Math.abs((stops[0] || 0) - y);
    for (let i = 1; i < stops.length; i++) {
      const d = Math.abs(stops[i] - y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  };

  // Document pages (gallery, dossier) may have sections taller than the
  // viewport. On those, allow free reading inside the section and only snap
  // at its edges. Scene-locked pages use 170vh tracks as animation ranges,
  // not readable overflow, so they always step section-to-section.
  const tallRangeAt = (y) => {
    if (hasScenes()) return null;
    const vh = window.innerHeight || 1;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (b - a > vh + TALL_SLACK && y >= a - 1 && y <= b + 1) return [a, b];
    }
    return null;
  };
  const isFreeInTall = (y) => {
    const range = tallRangeAt(y);
    if (!range) return false;
    const edge = Math.max(MERGE, TALL_EDGE * (window.innerHeight || 1));
    return y > range[0] + edge && y < range[1] - edge;
  };
  // True when this delta still has room to travel inside a tall section,
  // so we must not jump to the far edge and skip readable content.
  const roomInTall = (y, dy) => {
    const range = tallRangeAt(y);
    if (!range || !dy) return false;
    const edge = Math.max(MERGE, TALL_EDGE * (window.innerHeight || 1));
    if (dy > 0) return y < range[1] - edge;
    return y > range[0] + edge;
  };

  const nestedCanScroll = (start, dy) => {
    let el = start instanceof Element ? start : null;
    while (el && el !== document.body && el !== document.documentElement) {
      const st = getComputedStyle(el);
      const oy = st.overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        const top = el.scrollTop;
        const room = el.scrollHeight - el.clientHeight;
        if ((dy < 0 && top > 0) || (dy > 0 && top < room - 0.5)) return true;
      }
      el = el.parentElement;
    }
    return false;
  };

  const deltaPixels = (e) => {
    if (e.deltaMode === 1) {
      const lh = parseFloat(getComputedStyle(document.documentElement).lineHeight);
      const line = Number.isFinite(lh) && lh > 0 ? lh : 19.2;
      return e.deltaY * line;
    }
    if (e.deltaMode === 2) return e.deltaY * window.innerHeight * 0.9;
    return e.deltaY;
  };

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const setSnappingClass = (on) => {
    document.documentElement.classList.toggle("is-snapping", !!on);
  };

  const clearLockTimers = () => {
    lockedUntil = 0;
    if (lockCapTimer) {
      clearTimeout(lockCapTimer);
      lockCapTimer = 0;
    }
    if (snapFallbackTimer) {
      clearTimeout(snapFallbackTimer);
      snapFallbackTimer = 0;
    }
  };

  const resetWheelGesture = () => {
    peakAbsDy = 0;
    lastAbsDy = 0;
    troughAbsDy = 0;
    lastWheelDir = 0;
    inertiaTail = false;
    innerWheel = false;
    innerWheelGallery = false;
    galleryGestureInner = false;
    resetSlowAcc();
  };

  const resetSlowAcc = () => {
    slowAcc = 0;
    slowDir = 0;
    slowStart = 0;
    lastSlowAt = 0;
  };

  const markWheelTime = (dy) => {
    lastWheelAt = nowMs();
    wheelIdle = false;
    if (wheelIdleTimer) clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => {
      wheelIdle = true;
      gestureSpent = false;
      galleryGestureInner = false;
      resetSlowAcc();
    }, GESTURE_GAP_MS);
  };

  const noteSlowWheel = (dy) => {
    const dir = dy > 0 ? 1 : -1;
    const now = nowMs();
    // A long gap between ticks starts a new window. Continuous same-direction
    // input keeps accumulating, even if the whole stream lasts more than the
    // window, so a gentle trackpad still steps once it has travelled enough.
    if (slowDir && dir !== slowDir) {
      slowAcc = dy;
      slowDir = dir;
      slowStart = now;
      lastSlowAt = now;
      gestureSpent = false;
      return Math.abs(slowAcc) >= SLOW_STEP_PX;
    }
    if (!slowDir || (lastSlowAt && now - lastSlowAt > SLOW_WINDOW_MS)) {
      slowAcc = dy;
      slowDir = dir;
      slowStart = now;
      lastSlowAt = now;
      return !gestureSpent && Math.abs(slowAcc) >= SLOW_STEP_PX;
    }
    slowAcc += dy;
    lastSlowAt = now;
    return !gestureSpent && Math.abs(slowAcc) >= SLOW_STEP_PX;
  };

  // When we land on a new section, start its inner stage at the top so a
  // leftover arrival fling cannot leave scrollTop > 0 and then swallow
  // the next upward wheel as "inner scroll".
  const resetStageScrollAt = (y) => {
    const tracks = document.querySelectorAll(".hero-track, .intro-track, .pin-track, .teaser-track");
    const track = tracks[nearestIndex(y)];
    if (!track) return;
    track.querySelectorAll(".pin-stage").forEach((el) => { el.scrollTop = 0; });
  };

  const unlock = () => {
    snapping = false;
    gestureLocked = false;
    clearLockTimers();
    resetWheelGesture();
    sceneSnap.active = false;
    setSnappingClass(false);
  };

  const armLockCap = () => {
    lockedUntil = nowMs() + LOCK_CAP_MS;
    gestureLocked = true;
    if (lockCapTimer) clearTimeout(lockCapTimer);
    lockCapTimer = setTimeout(() => {
      lockCapTimer = 0;
      if (!snapping && nowMs() >= lockedUntil) gestureLocked = false;
    }, LOCK_CAP_MS + 16);
  };

  const lockActive = () => snapping || nowMs() < lockedUntil;

  const armSnapFallback = () => {
    if (snapFallbackTimer) clearTimeout(snapFallbackTimer);
    snapFallbackTimer = setTimeout(() => {
      snapFallbackTimer = 0;
      if (snapping) finishSnap();
    }, SNAP_MAX + 250);
  };

  const trackWheelDelta = (dy) => {
    const abs = Math.abs(dy);
    const dir = dy > 0 ? 1 : -1;
    if (dy) markWheelTime(dy);
    if (dir && lastWheelDir && dir !== lastWheelDir) gestureSpent = false;
    // Opposite micro-deltas (start of a trackpad flick, jitter) must not
    // flip the remembered direction: that would hide the real direction
    // change once the gesture grows past RISE_MIN.
    if (lastWheelDir && dir !== lastWheelDir && abs < RISE_MIN) return;
    // A significant direction change starts a fresh stream. Drop the
    // previous fling's peak and tail so they cannot block this gesture.
    if (lastWheelDir && dir !== lastWheelDir) {
      peakAbsDy = abs;
      lastAbsDy = abs;
      troughAbsDy = abs;
      inertiaTail = false;
      lastWheelDir = dir;
      return;
    }
    if (abs <= INERTIA_FLOOR || (peakAbsDy > 0 && abs <= peakAbsDy * 0.35) ||
        (lastAbsDy > 0 && abs < lastAbsDy * 0.85 && peakAbsDy > 0 && abs < peakAbsDy * 0.7)) {
      inertiaTail = true;
      if (troughAbsDy === 0 || abs < troughAbsDy) troughAbsDy = Math.max(abs, 0);
    } else if (abs >= peakAbsDy) {
      peakAbsDy = abs;
      inertiaTail = false;
      troughAbsDy = abs;
    }
    lastAbsDy = abs;
    if (abs >= RISE_MIN) lastWheelDir = dir;
  };

  const isNewWheelGesture = (dy) => {
    const abs = Math.abs(dy);
    const dir = dy > 0 ? 1 : -1;
    if (abs < RISE_MIN) return false;
    if (lastWheelDir && dir !== lastWheelDir) return true;
    // Same direction: only after the previous fling has actually decayed
    // (a still-strong tail close to the peak is not a new gesture), and
    // only when the new magnitude rises clearly from that trough. Using
    // the trough, not lastAbsDy, so a gradual ramp can still qualify.
    if (!inertiaTail) return false;
    if (peakAbsDy > 0 && troughAbsDy > peakAbsDy * 0.35) return false;
    return abs >= Math.max(RISE_MIN * 2, troughAbsDy * RISE_RATIO);
  };

  const finishSnap = () => {
    if (snapFallbackTimer) {
      clearTimeout(snapFallbackTimer);
      snapFallbackTimer = 0;
    }
    sceneSnap.u = 1;
    window.scrollTo(0, snapTo);
    if (nearestIndex(snapFrom) !== nearestIndex(snapTo)) resetStageScrollAt(snapTo);
    snapping = false;
    sceneSnap.active = false;
    setSnappingClass(false);
    if (buttonQueue) runQueuedButtonStep();
    if (!snapping) {
      // Hold only to ignore the current fling's tail; a new gesture can step
      // immediately, and the cap releases the lock if the tail never goes quiet.
      gestureLocked = true;
      armLockCap();
    }
    updateStepButtons();
  };

  const beginSnap = (toY) => {
    collectStops();
    const max = maxY();
    toY = Math.max(0, Math.min(max, toY));
    const from = window.scrollY || 0;
    if (Math.abs(toY - from) < 2) {
      window.scrollTo(0, toY);
      snapping = false;
      sceneSnap.active = false;
      gestureLocked = true;
      armLockCap();
      return;
    }
    if (snapping) return;
    snapping = true;
    setSnappingClass(true);
    snapFrom = from;
    snapTo = toY;
    const dist = Math.abs(toY - from);
    const vh = window.innerHeight || 1;
    const u = Math.max(0, Math.min(1, (dist / vh - 0.4) / 1.4));
    snapDur = SNAP_MIN + (SNAP_MAX - SNAP_MIN) * u;
    // Start the clock on the first animation frame so a hitch before the
    // first paint cannot skip most of the easing (that used to make an
    // upward snap, which often does more work on the incoming section,
    // look shorter and less smooth than a downward one).
    snapT0 = 0;
    sceneSnap.active = true;
    sceneSnap.fromY = snapFrom;
    sceneSnap.toY = snapTo;
    sceneSnap.u = 0;
    armSnapFallback();
    requestAnimationFrame(tick);
  };

  const tick = (t) => {
    if (reduceMq.matches) {
      unlock();
      return;
    }
    if (!snapping) return;
    if (!snapT0) snapT0 = t;
    const raw = Math.min(1, Math.max(0, (t - snapT0) / snapDur));
    const eased = easeOutCubic(raw);
    sceneSnap.active = true;
    sceneSnap.fromY = snapFrom;
    sceneSnap.toY = snapTo;
    sceneSnap.u = eased;
    window.scrollTo(0, snapFrom + (snapTo - snapFrom) * eased);
    if (raw >= 1) finishSnap();
    else requestAnimationFrame(tick);
  };

  const stepBy = (dir) => {
    if (snapping || !dir) return false;
    collectStops();
    const y = window.scrollY || 0;
    const dest = dir > 0 ? nextStop(y) : prevStop(y);
    if (dest == null) return false;
    beginSnap(dest);
    return true;
  };

  const settleIfNeeded = () => {
    if (snapping || reduceMq.matches || overlayOpen()) return;
    collectStops();
    const y = window.scrollY || 0;
    if (isFreeInTall(y)) return;
    const n = nearestStop(y);
    if (Math.abs(n - y) <= 2) {
      if (y !== n) window.scrollTo(0, n);
      return;
    }
    beginSnap(n);
  };

  const takeStep = (dir) => {
    if (!dir || snapping || gestureLocked) return false;
    buttonQueue = 0;
    gestureLocked = true;
    inertiaTail = false;
    innerWheel = false;
    const ok = stepBy(dir);
    if (!ok) {
      gestureLocked = false;
      armLockCap();
    }
    updateStepButtons();
    return ok;
  };

  // Net queued steps from the arrow buttons only (wheel/touch keep no-queue).
  // Positive is down, negative is up. Clamped to remaining sections from the
  // current snap destination (or the current stop if at rest).
  const clampButtonQueue = () => {
    const last = Math.max(0, stops.length - 1);
    const i = nearestIndex(snapping ? snapTo : (window.scrollY || 0));
    buttonQueue = Math.max(-i, Math.min(last - i, buttonQueue));
  };

  const finalButtonIndex = () => {
    const last = Math.max(0, stops.length - 1);
    const i = nearestIndex(snapping ? snapTo : (window.scrollY || 0));
    return Math.max(0, Math.min(last, i + buttonQueue));
  };

  const startButtonStep = (dir) => {
    if (snapping || !dir) return false;
    const ok = stepBy(dir);
    if (ok) {
      gestureLocked = true;
      inertiaTail = false;
    }
    return ok;
  };

  const runQueuedButtonStep = () => {
    if (!buttonQueue || snapping) return;
    clampButtonQueue();
    if (!buttonQueue) return;
    const dir = buttonQueue > 0 ? 1 : -1;
    buttonQueue -= dir;
    if (!startButtonStep(dir)) buttonQueue = 0;
  };

  const queueButtonStep = (dir) => {
    if (!dir || overlayOpen() || !hasScenes()) return;
    collectStops();
    if (stops.length < 2) return;
    if (snapping) {
      buttonQueue += dir > 0 ? 1 : -1;
      clampButtonQueue();
      updateStepButtons();
      return;
    }
    if (startButtonStep(dir)) updateStepButtons();
  };

  const updateStepButtons = () => {
    const root = document.querySelector("[data-section-steps]");
    if (!root) return;
    const up = root.querySelector('[data-section-step="-1"]');
    const down = root.querySelector('[data-section-step="1"]');
    const usable = hasScenes() && stops.length > 1 && !overlayOpen();
    root.hidden = !hasScenes() || stops.length < 2;
    const last = Math.max(0, stops.length - 1);
    const final = usable ? finalButtonIndex() : 0;
    const setBtn = (btn, on) => {
      if (!btn) return;
      btn.classList.toggle("is-off", !on);
      btn.disabled = !on;
      btn.setAttribute("aria-hidden", on ? "false" : "true");
    };
    setBtn(up, usable && final > 0);
    setBtn(down, usable && final < last);
  };

  const isScrollKey = (e) =>
    ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key);

  const onWheel = (e) => {
    // Dossier/modal/overlay: do not preventDefault or inspect the stream.
    if (stepperIgnores(e)) return;
    if (e.ctrlKey || e.metaKey) return;
    const overTimeline = e.target && e.target.closest && e.target.closest(".tl-viewport");
    if (overTimeline) {
      const axis = noteTlWheel(e);
      // Pending or horizontal: never step sections. Hold the page still
      // until the axis is known; once locked x, the timeline preventDefaults
      // and keeps panning with deltaX for the rest of the gesture.
      if (axis !== "y") {
        if (axis !== "x") e.preventDefault();
        return;
      }
    }
    const dy = deltaPixels(e);
    // During a section snap, hold the page still. Letting the arrival
    // fling scroll the incoming pin-stage leaves scrollTop > 0, and the
    // next upward wheel is then eaten as inner scrolling (the gallery
    // bug: only the up arrow could leave the section).
    if (snapping) {
      e.preventDefault();
      if (dy) trackWheelDelta(dy);
      return;
    }
    const wasInner = innerWheel;
    const wasGalleryInner = innerWheelGallery;
    const overGallery = !!(e.target && e.target.closest && e.target.closest(".pin-stage-facade"));
    if (nestedCanScroll(e.target, dy)) {
      // Native inner scroll, except: a leftover arrival fling must not
      // scroll the incoming pin-stage (that leftover scrollTop is what
      // then swallowed upward swipes from the gallery). Hold it still
      // until a new deliberate gesture or the post-snap lock ends.
      const inStage = e.target && e.target.closest && e.target.closest(".pin-stage");
      if (inStage && lockActive() && !isNewWheelGesture(dy)) {
        e.preventDefault();
        if (inStage.scrollTop) inStage.scrollTop = 0;
        trackWheelDelta(dy);
        return;
      }
      innerWheel = true;
      innerWheelGallery = overGallery || !!(inStage && inStage.classList.contains("pin-stage-facade"));
      if (innerWheelGallery) galleryGestureInner = true;
      trackWheelDelta(dy);
      return;
    }
    const y = window.scrollY || 0;
    if (roomInTall(y, dy)) {
      innerWheel = true;
      trackWheelDelta(dy);
      return;
    }
    // Never let the wheel move the document in section mode: no drift,
    // no peek of the next loop, no rubber-band.
    e.preventDefault();
    if (!dy) return;
    const dir = dy > 0 ? 1 : -1;
    const fromInnerEdge = wasInner;
    const fromGalleryInner = wasGalleryInner;
    innerWheel = false;
    innerWheelGallery = false;
    // Slow, gentle same-direction ticks accumulate over a short window
    // and can trigger a single step. Fast peaks still step on their own.
    if (Math.abs(dy) < RISE_MIN && !isNewWheelGesture(dy)) {
      trackWheelDelta(dy);
      if (fromGalleryInner || lockActive() || gestureSpent || !noteSlowWheel(dy)) return;
      gestureSpent = true;
      resetSlowAcc();
      takeStep(dir);
      return;
    }
    // Gallery: only a fresh gesture at the inner top or bottom may hand
    // off to the section stepper, so an inner fling's inertia cannot skip
    // a section. The sticky flag lasts for the whole inner gesture and is
    // cleared after an idle gap, which is what makes the next wheel fresh.
    // Other nested scrollers keep the continuing-swipe handoff.
    if ((fromGalleryInner || galleryGestureInner) && !isNewWheelGesture(dy)) {
      trackWheelDelta(dy);
      return;
    }
    // Past a nested or tall-section edge: a continuing swipe should step
    // immediately (no quiet gap). A new deliberate gesture (direction
    // change, or a rise from the spent fling's trough) also steps even
    // while a lock or inertia tail is still in play. Tiny decaying tails
    // must not advance again.
    if (!fromInnerEdge && lockActive() && !isNewWheelGesture(dy)) {
      trackWheelDelta(dy);
      return;
    }
    if (!fromInnerEdge && !isNewWheelGesture(dy) && (inertiaTail || (peakAbsDy > 0 && Math.abs(dy) < peakAbsDy * 0.7))) {
      trackWheelDelta(dy);
      return;
    }
    if (gestureSpent && !isNewWheelGesture(dy) && !wheelIdle) {
      trackWheelDelta(dy);
      return;
    }
    gestureLocked = false;
    lockedUntil = 0;
    trackWheelDelta(dy);
    gestureSpent = true;
    resetSlowAcc();
    takeStep(dir);
  };
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });

  window.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) {
      touchActive = false;
      return;
    }
    touchActive = true;
    touchStepped = false;
    touchInner = false;
    touchOnTl = !!(e.target && e.target.closest && e.target.closest(".tl-viewport"));
    touchX0 = e.touches[0].clientX;
    touchY0 = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (stepperIgnores(e)) return;
    if (!touchActive || !e.touches || e.touches.length !== 1) {
      if (snapping || hasScenes()) e.preventDefault();
      return;
    }
    const dy = e.touches[0].clientY - touchY0;
    const dx = e.touches[0].clientX - touchX0;
    if (touchOnTl) {
      const axis = noteTlDrag(dx, dy);
      // Horizontal (or still deciding): let the timeline pan. Do not snap.
      if (axis !== "y") return;
    }
    if (nestedCanScroll(e.target, -dy)) {
      touchInner = true;
      return;
    }
    const y = window.scrollY || 0;
    if (roomInTall(y, -dy)) {
      touchInner = true;
      return;
    }
    // Lock native touch scrolling on sectioned pages (and whenever a snap
    // is in progress) so the background cannot rubber-band or drift.
    if (hasScenes() || snapping || gestureLocked || (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > 1)) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener("touchend", (e) => {
    if (!touchActive) return;
    touchActive = false;
    if (stepperIgnores(e)) return;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) {
      return;
    }
    const dy = t.clientY - touchY0;
    const dx = t.clientX - touchX0;
    const axis = touchOnTl ? (tlAxis() || noteTlDrag(dx, dy)) : null;
    if (touchOnTl) resetTlAxis();
    if (touchOnTl && axis === "x") {
      return;
    }
    if (!touchStepped && !touchInner && (axis === "y" || (!touchOnTl && Math.abs(dy) >= SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)))) {
      if (axis === "y" || Math.abs(dy) >= SWIPE_THRESHOLD) {
        touchStepped = true;
        takeStep(dy < 0 ? 1 : -1);
        return;
      }
    }
    if (!snapping && !hasScenes()) settleIfNeeded();
  }, { passive: true });

  window.addEventListener("touchcancel", () => {
    touchActive = false;
    if (touchOnTl) resetTlAxis();
    touchOnTl = false;
  }, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (!isScrollKey(e)) return;
    const tag = (e.target && e.target.tagName) || "";
    const onStepBtn = e.target && e.target.closest && e.target.closest("[data-section-step]");
    if (onStepBtn && e.key === " ") return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (tag === "BUTTON" && !onStepBtn) || e.target?.isContentEditable) return;
    if (reduceMq.matches || overlayOpen() || eventInModal(e) || !hasScenes()) return;
    const y = window.scrollY || 0;
    const galleryStage = document.querySelector(".is-current-scene .pin-stage-facade");
    if (galleryStage) {
      if (e.key === "Home" && galleryStage.scrollTop > 0) {
        galleryStage.scrollTop = 0;
        e.preventDefault();
        return;
      }
      if (e.key === "End" && nestedCanScroll(galleryStage, 1)) {
        galleryStage.scrollTop = galleryStage.scrollHeight;
        e.preventDefault();
        return;
      }
      const keyDy = (e.key === "PageDown" || e.key === " " || e.key === "ArrowDown") ? 1
        : (e.key === "PageUp" || e.key === "ArrowUp") ? -1 : 0;
      if (keyDy && nestedCanScroll(galleryStage, keyDy)) {
        const jump = (e.key === "ArrowDown" || e.key === "ArrowUp") ? 80
          : Math.max(80, galleryStage.clientHeight * 0.85);
        galleryStage.scrollTop += keyDy * jump;
        e.preventDefault();
        return;
      }
    }
    if (e.key === "PageDown" || e.key === " " || e.key === "ArrowDown") {
      if (roomInTall(y, 1)) return;
      e.preventDefault();
      if (e.repeat || snapping || gestureLocked) return;
      takeStep(1);
      return;
    }
    if (e.key === "PageUp" || e.key === "ArrowUp") {
      if (roomInTall(y, -1)) return;
      e.preventDefault();
      if (e.repeat || snapping || gestureLocked) return;
      takeStep(-1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      if (snapping || gestureLocked) return;
      buttonQueue = 0;
      gestureLocked = true;
      inertiaTail = false;
      beginSnap(stops[0] || 0);
      updateStepButtons();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      if (snapping || gestureLocked) return;
      buttonQueue = 0;
      gestureLocked = true;
      inertiaTail = false;
      beginSnap(stops[stops.length - 1] || maxY());
      updateStepButtons();
    }
  });

  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 && e.clientX >= document.documentElement.clientWidth) {
      scrollbarDrag = true;
    }
  }, { passive: true });
  window.addEventListener("mouseup", () => {
    if (!scrollbarDrag) return;
    scrollbarDrag = false;
    if (!snapping) settleIfNeeded();
  }, { passive: true });

  const onScrollEnd = () => {
    if (snapping || reduceMq.matches || overlayOpen() || scrollbarDrag || touchActive) return;
    if (hasScenes()) {
      const y = window.scrollY || 0;
      const n = nearestStop(y);
      if (Math.abs(n - y) > 0.5) window.scrollTo(0, n);
      return;
    }
    settleIfNeeded();
  };
  window.addEventListener("scrollend", onScrollEnd, { passive: true });
  // If a pixel of native scroll still leaks (rubber-band, scrollbar), snap
  // the document back so the background and its shade cannot drift.
  const clampSceneScroll = () => {
    if (snapping || reduceMq.matches || overlayOpen() || scrollbarDrag || touchActive) return;
    if (!hasScenes()) return;
    const y = window.scrollY || 0;
    const n = nearestStop(y);
    if (Math.abs(n - y) > 0.5) window.scrollTo(0, n);
  };
  window.addEventListener("scroll", clampSceneScroll, { passive: true });
  // overflow:clip should already prevent this; reset anyway so a rubber-band
  // or programmatic scrollTop cannot reveal the overscan of a scaled loop.
  document.addEventListener("scroll", (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (!el.matches(".hero, .pin-panel, .hero-media")) return;
    if (el.scrollTop) el.scrollTop = 0;
    if (el.scrollLeft) el.scrollLeft = 0;
  }, { capture: true, passive: true });

  const listLandingY = () => {
    if (!document.body.classList.contains("page-performances")
      && !document.body.classList.contains("page-residencies")) return null;
    const rows = [...document.querySelectorAll(".pin-track[data-start]")].map((el) => ({
      el,
      start: el.dataset.start,
      end: el.dataset.end || el.dataset.start,
    }));
    const row = pickLandingEntry(rows, clientToday());
    if (!row || !row.el) return null;
    return offsetDoc(row.el);
  };

  const landOnList = () => {
    const y = listLandingY();
    if (y == null) return false;
    collectStops();
    const n = nearestStop(Math.max(0, Math.min(maxY(), y)));
    window.scrollTo(0, n);
    return true;
  };

  const scrollToHash = () => {
    const raw = location.hash || "";
    const id = decodeURIComponent(raw.startsWith("#") ? raw.slice(1) : raw);
    if (!id) return false;
    const el = document.getElementById(id);
    if (!el) return false;
    // Headings live inside position:fixed panels, so their viewport box is not
    // the document offset of the section. Snap to the enclosing track.
    const track = el.closest(".pin-track, .hero-track, .intro-track, .teaser-track") || el;
    unlock();
    collectStops();
    const y = Math.max(0, Math.min(maxY(), offsetDoc(track)));
    const n = nearestStop(y);
    window.scrollTo(0, n);
    return true;
  };
  window.addEventListener("hashchange", scrollToHash);
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    unlock();
    requestAnimationFrame(() => {
      if (location.hash) scrollToHash();
      else settleIfNeeded();
    });
  }, { passive: true });

  window.addEventListener("resize", () => {
    collectStops();
    if (!snapping) settleIfNeeded();
    updateStepButtons();
  }, { passive: true });

  reduceMq.addEventListener("change", () => {
    if (reduceMq.matches) unlock();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("[data-section-step]");
    if (!btn || btn.disabled) return;
    const dir = Number(btn.getAttribute("data-section-step"));
    if (!dir) return;
    e.preventDefault();
    queueButtonStep(dir);
  });

  collectStops();
  if (location.hash) scrollToHash();
  else if (!landOnList()) settleIfNeeded();
  updateStepButtons();
  window.addEventListener("load", () => {
    collectStops();
    if (location.hash) scrollToHash();
    else if (!landOnList()) settleIfNeeded();
    updateStepButtons();
  });

  window.__hlSectionScroll = {
    /** After the router swaps the page: forget the old stops, land on y. */
    reset(y = 0, hash = "", { land = false } = {}) {
      unlock();
      gestureSpent = false;
      wheelIdle = true;
      galleryGestureInner = false;
      if (wheelIdleTimer) { clearTimeout(wheelIdleTimer); wheelIdleTimer = 0; }
      resetSlowAcc();
      buttonQueue = 0;
      collectStops();
      if (hash && scrollToHash()) { updateStepButtons(); return; }
      if (land && landOnList()) { updateStepButtons(); return; }
      window.scrollTo(0, Math.max(0, Math.min(maxY(), y)));
      settleIfNeeded();
      updateStepButtons();
    },
    get pending() { return 0; },
    get gestureLocked() { return gestureLocked; },
    get snapping() { return snapping; },
    get stops() { return stops.slice(); },
    get buttonQueue() { return buttonQueue; },
    updateStepButtons,
    get snapFrom() { return snapFrom; },
    get snapTo() { return snapTo; },
    get snapDur() { return snapDur; },
    get sceneSnap() { return { ...sceneSnap }; },
  };
}




function setupSceneLock() {
  if (reduceMq.matches) return;
  if (!document.body.classList.contains("has-scenes")) return;
  document.documentElement.classList.add("scene-lock");

  const isScene = (el) =>
    el && el.matches && el.matches(".scene-track, .hero-track, .intro-track, .pin-track, .teaser-track, [data-pin], [data-scene]");

  const absorbLoose = () => {
    const roots = [document.querySelector("main"), document.body].filter(Boolean);
    const seen = new Set();
    for (const root of roots) {
      for (const el of [...root.children]) {
        if (seen.has(el) || isScene(el) || el.matches("script, style, .site-chrome, .skip, .visually-hidden, .cursor-glow, .paint-trail, .fireflies, .nav-toggle, .enter-gate, .page-root, .hl-modal")) continue;
        if (el.querySelector && el.querySelector(".pin-track, .hero-track, .intro-track")) continue;
        let next = el.nextElementSibling;
        while (next && !isScene(next)) next = next.nextElementSibling;
        let host = null;
        if (next) host = next.querySelector(".pin-copy") || next.querySelector(".pin-stage") || next.querySelector(".page-intro") || next;
        if (!host) {
          const prev = el.previousElementSibling;
          let p = prev;
          while (p && !isScene(p)) p = p.previousElementSibling;
          if (p) host = p.querySelector(".pin-copy") || p.querySelector(".pin-stage") || p.querySelector(".page-intro") || p;
        }
        if (!host) continue;
        let box = host.querySelector(":scope > .scene-absorbed");
        if (!box) {
          box = document.createElement("div");
          box.className = "scene-absorbed";
          host.insertBefore(box, host.firstChild);
        }
        box.appendChild(el);
        seen.add(el);
      }
    }
  };
  absorbLoose();

  const tracks = [...document.querySelectorAll(".hero-track, .intro-track, [data-pin], .teaser-track")];
  if (!tracks.length) return;
  tracks.forEach((el, i) => el.classList.toggle("is-last-scene", i === tracks.length - 1));

  const panelOf = (track) =>
    track.querySelector(".hero, .pin-panel, .page-intro, .teaser-public") || track;

  const offsetDoc = (el) => Math.round(el.getBoundingClientRect().top + (window.scrollY || 0));

  const fadeBand = 0.18;
  let tops = [];
  let heights = [];
  const measureTracks = () => {
    const y = window.scrollY || 0;
    tops = tracks.map((track) => Math.round(track.getBoundingClientRect().top + y));
    heights = tracks.map((track) => Math.max(1, track.offsetHeight));
  };
  measureTracks();

  const nearestTrackIndex = (y, tops) => {
    let best = 0;
    let bestD = Math.abs((tops[0] || 0) - y);
    for (let i = 1; i < tops.length; i++) {
      const d = Math.abs(tops[i] - y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  };

  let lastShift = "";
  const lastOp = [];
  const lastShiftT = [];
  const lastPE = [];
  const lastVis = [];
  const lastCurrent = [];

  const update = () => {
    const y = window.scrollY || 0;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const shift = Math.round((window.innerHeight || 0) / 8) + "px";
    if (shift !== lastShift) {
      document.documentElement.style.setProperty("--scene-shift", shift);
      lastShift = shift;
    }

    const n = tracks.length;
    const opacities = new Array(n).fill(0);
    const shiftTs = new Array(n).fill(0);

    const applyFade = (fromI, toI, u) => {
      if (fromI === toI || fromI < 0 || toI < 0) {
        const i = Math.max(0, Math.min(n - 1, fromI));
        opacities[i] = 1;
        return;
      }
      const fadeStart = 1 - fadeBand;
      const fade = u <= fadeStart ? 0 : Math.max(0, Math.min(1, (u - fadeStart) / fadeBand));
      opacities[fromI] = 1 - fade;
      opacities[toI] = fade;
      if (fade > 0 && fade < 1) {
        if (toI > fromI) {
          shiftTs[fromI] = opacities[fromI] - 1;
          shiftTs[toI] = 1 - opacities[toI];
        } else {
          shiftTs[fromI] = 1 - opacities[fromI];
          shiftTs[toI] = opacities[toI] - 1;
        }
      }
    };

    if (sceneSnap.active && Math.abs(sceneSnap.toY - sceneSnap.fromY) > 2) {
      applyFade(
        nearestTrackIndex(sceneSnap.fromY, tops),
        nearestTrackIndex(sceneSnap.toY, tops),
        sceneSnap.u,
      );
    } else if (n) {
      let lo = 0;
      for (let i = 0; i < n; i++) {
        if (tops[i] <= y + 1) lo = i;
      }
      const hi = Math.min(n - 1, lo + 1);
      const a = tops[lo];
      const b = lo === hi ? a : tops[hi];
      const span = b - a;
      if (span <= 2) opacities[lo] = 1;
      else applyFade(lo, hi, Math.max(0, Math.min(1, (y - a) / span)));
      if (y <= 1) {
        opacities.fill(0);
        shiftTs.fill(0);
        opacities[0] = 1;
      } else if (y >= max - 1) {
        opacities.fill(0);
        shiftTs.fill(0);
        opacities[n - 1] = 1;
      }
    }

    let best = 0;
    let bestO = -1;
    const playVideos = [];
    const warmVideos = [];
    let snapFromI = -1;
    let snapToI = -1;
    if (sceneSnap.active && Math.abs(sceneSnap.toY - sceneSnap.fromY) > 2) {
      snapFromI = nearestTrackIndex(sceneSnap.fromY, tops);
      snapToI = nearestTrackIndex(sceneSnap.toY, tops);
    }
    tracks.forEach((track, i) => {
      const top = tops[i];
      const h = heights[i] || 1;
      const local = (y - top) / h;
      const o = opacities[i];
      const panel = panelOf(track);
      const op = o.toFixed(3);
      if (lastOp[i] !== op) {
        panel.style.opacity = op;
        lastOp[i] = op;
      }
      const vis = o > 0.001 ? "visible" : "hidden";
      if (lastVis[i] !== vis) {
        panel.style.visibility = vis;
        lastVis[i] = vis;
      }
      const pe = o > 0.4 ? "auto" : "none";
      if (lastPE[i] !== pe) {
        panel.style.pointerEvents = pe;
        lastPE[i] = pe;
      }
      const st = shiftTs[i].toFixed(3);
      if (lastShiftT[i] !== st) {
        panel.style.setProperty("--scene-shift-t", st);
        lastShiftT[i] = st;
      }
      if (o >= bestO) {
        bestO = o;
        best = i;
      }
      if (track.classList.contains("hero-track")) {
        const p = Math.max(0, Math.min(1, local));
        track.style.setProperty("--hero-scale", (1 + p * 0.08).toFixed(3));
        track.style.setProperty("--hero-copy-o", (p < 0.7 ? 1 : (1 - p) / 0.3).toFixed(3));
      }
      const video = panel.querySelector(".hero-video");
      if (video) {
        if (o > 0.01 || i === snapFromI || i === snapToI) playVideos.push(video);
        else if (Math.abs(i - best) === 1) warmVideos.push(video);
      }
    });
    tracks.forEach((track, i) => {
      const on = i === best;
      if (lastCurrent[i] !== on) {
        panelOf(track).classList.toggle("is-current-scene", on);
        lastCurrent[i] = on;
      }
    });
    if (window.__hlVideos) window.__hlVideos.sync(playVideos, warmVideos);
  };

  let ticking = false;
  const requestTick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", () => { measureTracks(); requestTick(); }, { passive: true });
  update();
}


function setupContactForm() {
  const form = document.querySelector("form.booking-form");
  if (!form || form.classList.contains("is-disabled") || form.getAttribute("aria-disabled") === "true") return;
  const status = form.querySelector(".form-status");
  const submit = form.querySelector("[type=submit]");
  const sending = form.dataset.sending || "";
  const success = form.dataset.success || "";
  const error = form.dataset.error || "";
  const defaultLabel = submit ? submit.textContent : "";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.busy === "1") return;
    form.dataset.busy = "1";
    if (submit) {
      submit.disabled = true;
      submit.textContent = sending;
    }
    if (status) {
      status.textContent = "";
      status.classList.remove("is-success", "is-error");
    }
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("submit failed");
      form.reset();
      if (status) {
        status.textContent = success;
        status.classList.add("is-success");
      }
    } catch (err) {
      if (status) {
        status.textContent = error;
        status.classList.add("is-error");
      }
    } finally {
      form.dataset.busy = "0";
      if (submit) {
        submit.disabled = false;
        submit.textContent = defaultLabel;
      }
    }
  });
}

// Page-scoped setup. Every listener added while it runs gets the page's
// AbortSignal, so the router can drop them all before the next page.
let pageController = null;

function runPageScoped(fn) {
  const signal = pageController.signal;
  const proto = EventTarget.prototype;
  const original = proto.addEventListener;
  proto.addEventListener = function patched(type, listener, options) {
    let opts = options;
    if (opts == null || typeof opts === "boolean") opts = { capture: !!opts, signal };
    else if (!opts.signal) opts = { ...opts, signal };
    return original.call(this, type, listener, opts);
  };
  try {
    fn();
  } finally {
    proto.addEventListener = original;
  }
}

function setupPage() {
  if (pageController) pageController.abort();
  pageController = new AbortController();
  runPageScoped(() => {
    setupTabs();
    setupContactForm();
    setupBgSeg();
    setupHeroMotion();
    setupEdgeTitles();
    setupPinFallback();
    fitEdgeTitles();
    setupSceneLock();
    setupTimelines();
    setupHeroHighlight();
    setupGalleryRandom();
  });
}

// Once per visit: the header, decor layers, section scroll, sound, modals.
setupMobileNav();
setupLangSwitcher();
setupCursorGlow();
setupPaintTrail();
setupFireflies();
setupSoundButtons();
setupModals();
setupGalleryLightbox();
setupPage();
setupSectionScroll();
setupEnterGate();
openTrailerIfRequested();
setupRouter({
  before() {
    closeModal();
    closeLightbox();
    document.body.classList.remove("nav-open", "lang-menu-open");
    document.documentElement.classList.remove("scene-lock");
  },
  after({ y, hash, land = false }) {
    window.scrollTo(0, 0);
    setupPage();
    syncSoundButtons();
    if (window.__hlSectionScroll) window.__hlSectionScroll.reset(y, hash, { land });
    else window.scrollTo(0, y);
    window.dispatchEvent(new Event("resize"));
    openTrailerIfRequested();
    const target = document.getElementById("contenu");
    if (target) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true, focusVisible: false });
    }
  },
});
window.__hlSoundState = () => sound.debug();
