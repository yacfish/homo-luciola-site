// Lightbox for the square-tile gallery: contain the full photograph, slide
// between neighbours, trap focus, and block page/section scrolling while open.
const FOCUSABLE = 'button:not([disabled]), [href]:not([hidden]), [tabindex]:not([tabindex="-1"])';
const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = null;

function trapTab(e, root) {
  const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function collectItems(root) {
  return [...root.querySelectorAll("[data-gallery-open]")].map((btn, i) => ({
    index: i,
    src: btn.getAttribute("data-src") || "",
    alt: btn.getAttribute("data-alt") || "",
    credit: btn.getAttribute("data-credit") || "",
    trigger: btn,
  }));
}

function box() {
  return document.querySelector("[data-hl-lightbox]");
}

function fillImg(img, item) {
  img.src = item.src;
  img.alt = item.alt || "";
}

function makeSlide(item) {
  const slide = document.createElement("div");
  slide.className = "hl-lightbox-slide";
  const img = document.createElement("img");
  img.decoding = "async";
  fillImg(img, item);
  slide.appendChild(img);
  return slide;
}

function setCredit(item) {
  const el = box()?.querySelector(".hl-lightbox-credit");
  if (!el) return;
  el.textContent = item.credit || "";
  el.hidden = !item.credit;
}

function preload(items, index) {
  if (!items.length) return;
  const n = items.length;
  for (const j of [(index + 1) % n, (index - 1 + n) % n]) {
    if (j === index) continue;
    const src = items[j].src;
    if (!src) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}

function inertOthers(keep) {
  const inerted = [];
  const mark = (el) => {
    if (!el || el === keep || el.contains(keep) || keep.contains(el) || el.hasAttribute("inert")) return;
    el.setAttribute("inert", "");
    inerted.push(el);
  };
  mark(document.querySelector(".site-chrome"));
  mark(document.querySelector(".skip"));
  mark(document.querySelector(".section-steps"));
  const root = document.getElementById("page-root");
  if (root) mark(root);
  return inerted;
}

export function closeLightbox() {
  if (!state) return;
  const { modal, trigger, inerted, onKey, onWheel } = state;
  state = null;
  modal.hidden = true;
  const track = modal.querySelector(".hl-lightbox-track");
  if (track) track.replaceChildren();
  document.body.classList.remove("lightbox-open", "modal-open");
  inerted.forEach((el) => el.removeAttribute("inert"));
  document.removeEventListener("keydown", onKey, true);
  modal.removeEventListener("wheel", onWheel);
  modal.removeEventListener("touchmove", onWheel);
  if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
}

function showIndex(index, { animate = false, dir = 1 } = {}) {
  if (!state) return;
  const { modal, items } = state;
  const n = items.length;
  if (!n) return;
  const next = ((index % n) + n) % n;
  const item = items[next];
  const track = modal.querySelector(".hl-lightbox-track");
  const reduce = reduceMq.matches || !animate || !track.querySelector(".hl-lightbox-slide");
  if (reduce) {
    track.replaceChildren(makeSlide(item));
    state.index = next;
    setCredit(item);
    preload(items, next);
    return;
  }
  if (state.animating) return;
  const outgoing = track.querySelector(".hl-lightbox-slide");
  const incoming = makeSlide(item);
  incoming.classList.add("is-enter");
  incoming.style.transform = `translateX(${dir * 100}%)`;
  track.appendChild(incoming);
  state.animating = true;
  incoming.getBoundingClientRect();
  outgoing.style.transform = `translateX(${-dir * 100}%)`;
  incoming.style.transform = "translateX(0)";
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (!state) return;
    outgoing.remove();
    incoming.classList.remove("is-enter");
    incoming.style.transform = "";
    state.index = next;
    state.animating = false;
    setCredit(item);
    preload(items, next);
  };
  incoming.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 450);
}

function step(dir) {
  if (!state || state.animating) return;
  showIndex(state.index + dir, { animate: true, dir });
}

function openLightbox(trigger) {
  const modal = box();
  const root = trigger.closest("[data-gallery]") || document;
  if (!modal) return false;
  const items = collectItems(root);
  if (!items.length) return false;
  if (state) closeLightbox();
  const start = items.findIndex((it) => it.trigger === trigger);
  const index = start >= 0 ? start : Number(trigger.getAttribute("data-gallery-open")) || 0;
  const item = items[index] || items[0];
  const track = modal.querySelector(".hl-lightbox-track");
  track.replaceChildren(makeSlide(item));
  setCredit(item);
  modal.hidden = false;
  document.body.classList.add("lightbox-open", "modal-open");
  const inerted = inertOthers(modal);
  const onKey = (e) => {
    if (!state) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeLightbox();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      step(-1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === "Tab") {
      trapTab(e, modal);
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener("keydown", onKey, true);
  modal.addEventListener("wheel", onWheel, { passive: false });
  modal.addEventListener("touchmove", onWheel, { passive: false });
  state = { modal, items, index, trigger, inerted, onKey, onWheel, animating: false };
  preload(items, index);
  const closeBtn = modal.querySelector(".hl-lightbox-close");
  if (closeBtn) closeBtn.focus({ preventScroll: true });
  return true;
}

export function setupGalleryLightbox() {
  document.addEventListener("click", (e) => {
    const closer = e.target.closest && e.target.closest("[data-lightbox-close]");
    if (closer && state) {
      e.preventDefault();
      closeLightbox();
      return;
    }
    const prev = e.target.closest && e.target.closest("[data-lightbox-prev]");
    if (prev && state) {
      e.preventDefault();
      step(-1);
      return;
    }
    const next = e.target.closest && e.target.closest("[data-lightbox-next]");
    if (next && state) {
      e.preventDefault();
      step(1);
      return;
    }
    const tile = e.target.closest && e.target.closest("[data-gallery-open]");
    if (!tile || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    if (openLightbox(tile)) e.preventDefault();
  });

  // Horizontal swipe on the photograph; wrap at both ends.
  let touchX = 0;
  let touchY = 0;
  let touching = false;
  document.addEventListener("touchstart", (e) => {
    if (!state || !e.touches[0]) return;
    if (!e.target.closest || !e.target.closest("[data-hl-lightbox]")) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    touching = true;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!state || !touching) return;
    touching = false;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

export function isLightboxOpen() {
  return !!state;
}

function pickUnique(pool, n) {
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const key = item && (item.src || item.srcSmall);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === n) break;
  }
  return out;
}

export function applyGalleryTile(btn, item, index) {
  if (!btn || !item) return;
  btn.setAttribute("data-gallery-open", String(index));
  btn.setAttribute("data-src", item.src || "");
  btn.setAttribute("data-src-small", item.srcSmall || "");
  btn.setAttribute("data-alt", item.alt || "");
  btn.setAttribute("data-credit", item.credit || "");
  btn.setAttribute("aria-label", item.alt || "");
  const img = btn.querySelector("img");
  if (!img) return;
  const small = item.srcSmall || item.src || "";
  const big = item.src || small;
  img.src = small;
  img.srcset = small && big ? `${small} 800w, ${big} 1600w` : "";
  img.alt = "";
  if (item.width) img.width = item.width;
  if (item.height) img.height = item.height;
}

/** Replace the default tiles with a fresh unique random pick. Same tile
 *  nodes stay in the grid so the layout does not shift. */
export function setupGalleryRandom() {
  document.querySelectorAll("[data-gallery-random]").forEach((root) => {
    const n = Math.max(1, Number(root.getAttribute("data-gallery-random")) || 4);
    const script = root.querySelector("[data-gallery-pool]");
    if (!script) return;
    let pool = [];
    try { pool = JSON.parse(script.textContent || "[]"); } catch (_err) { return; }
    if (!Array.isArray(pool) || !pool.length) return;
    const pick = pickUnique(pool, Math.min(n, pool.length));
    const tiles = [...root.querySelectorAll("[data-gallery-open]")];
    pick.forEach((item, i) => applyGalleryTile(tiles[i], item, i));
  });
}
