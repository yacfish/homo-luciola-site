// One windowed modal per page (markup in the page, filled on demand) for the
// trailer (youtube-nocookie), the dossier (iframe), family photos (image),
// and the timeline's chronological list. The list does not hold the soundtrack.
import { sound } from "./sound.js";

const FOCUSABLE = 'a[href]:not([hidden]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
let current = null;

function trapTab(e, win) {
  const items = [...win.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el.tagName === "IFRAME");
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

function settleTrailerUrl() {
  const raw = location.pathname || "/";
  const path = raw.endsWith("/") ? raw : `${raw}/`;
  if (!/\/trailer\/$/.test(path)) return;
  const home = path.replace(/trailer\/$/, "");
  try {
    history.replaceState({ ...(history.state || {}), hl: 1, y: window.scrollY || 0 }, "", home);
  } catch (_err) { /* ignore */ }
  document.body.classList.remove("open-trailer");
  if (window.__hlRouter && typeof window.__hlRouter.syncPath === "function") {
    window.__hlRouter.syncPath();
  }
}

export function closeModal() {
  if (!current) return;
  const { modal, trigger, kind, inerted, onKey, player } = current;
  current = null;
  if (player && typeof player.destroy === "function") {
    try { player.destroy(); } catch (_err) { /* ignore */ }
  }
  modal.querySelector(".hl-modal-body").innerHTML = ""; // stops the video
  modal.querySelector(".hl-modal-body").removeAttribute("style");
  modal.hidden = true;
  modal.classList.remove(`is-${kind}`);
  document.body.classList.remove("modal-open");
  inerted.forEach((el) => el.removeAttribute("inert"));
  document.removeEventListener("keydown", onKey, true);
  if (kind === "youtube") sound.release("trailer");
  settleTrailerUrl();
  if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
}

function youtubeEmbedSrc(id) {
  const origin = encodeURIComponent(location.origin);
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&vq=hd1080&hd=1&enablejsapi=1&origin=${origin}`;
}

function measureYoutubeBody(body) {
  const rect = body.getBoundingClientRect();
  let cssW = Math.round(rect.width);
  let cssH = Math.round(rect.height);
  if (cssW < 16 || cssH < 9) {
    const pad = 48;
    cssW = Math.max(320, Math.round(Math.min(window.innerWidth - pad, 64 * 16)));
    cssH = Math.max(180, Math.round(cssW * 9 / 16));
  }
  const dpr = window.devicePixelRatio || 1;
  return {
    cssW,
    cssH,
    dpr,
    hintW: Math.max(cssW, Math.round(cssW * dpr)),
    hintH: Math.max(cssH, Math.round(cssH * dpr)),
  };
}

function loadYtApi(timeoutMs) {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("yt api timeout")), timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
      window.clearTimeout(timer);
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
    if (!document.querySelector("script[src*='youtube.com/iframe_api']")) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("yt api load"));
      };
      document.head.appendChild(s);
    }
    if (window.YT && window.YT.Player) {
      window.clearTimeout(timer);
      resolve(window.YT);
    }
  });
}

function applyHd1080(player) {
  try { player.setPlaybackQuality("hd1080"); } catch (_err) { /* may be a no-op */ }
  try { player.setPlaybackQualityRange("hd1080", "highres"); } catch (_err) { /* may be a no-op */ }
}

function mountYoutube(modal, body, id, title) {
  // The modal is already visible and laid out. Measure that box, lock it,
  // then create the iframe at that size before setting src so YouTube does
  // not initialise in a hidden or zero-size player (which tends to pick 480p).
  void modal.offsetWidth;
  const size = measureYoutubeBody(body);
  body.style.width = `${size.cssW}px`;
  body.style.height = `${size.cssH}px`;
  const initSize = `${size.cssW}x${size.cssH}@${Number(size.dpr.toFixed(2))}`;
  body.dataset.hlYtInitSize = initSize;
  modal.dataset.hlYtInitSize = initSize;

  const frame = document.createElement("iframe");
  frame.title = title;
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.setAttribute("allowfullscreen", "");
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.width = String(size.hintW);
  frame.height = String(size.hintH);
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.dataset.hlYtInitSize = initSize;
  body.appendChild(frame);
  void frame.offsetWidth;
  frame.src = youtubeEmbedSrc(id);

  loadYtApi(2500).then((YT) => {
    if (!current || current.kind !== "youtube") return;
    const player = new YT.Player(frame, {
      events: {
        onReady(e) {
          applyHd1080(e.target);
          try { e.target.unMute(); e.target.playVideo(); } catch (_err) { /* ignore */ }
          window.setTimeout(() => {
            if (!current || current.player !== player) return;
            let st = -1;
            try { st = player.getPlayerState(); } catch (_err) { /* ignore */ }
            const going = st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING;
            if (going) return;
            // Autoplay with sound was blocked. Try muted autoplay; if that
            // is also blocked, leave the player ready for a user gesture.
            try { player.mute(); player.playVideo(); } catch (_err) { /* ignore */ }
          }, 500);
        },
        onStateChange(e) {
          if (e.data === YT.PlayerState.PLAYING) applyHd1080(e.target);
        },
      },
    });
    current.player = player;
  }).catch(() => { /* iframe already playing with vq=hd1080&hd=1 */ });
}

function openModal(trigger) {
  const modal = document.querySelector("[data-hl-modal]");
  if (!modal) return false;
  if (current) closeModal();
  const kind = trigger.dataset.modal;
  const body = modal.querySelector(".hl-modal-body");
  const title = trigger.dataset.modalTitle || trigger.textContent.trim();
  modal.querySelector(".hl-modal-title").textContent = title;
  const pdf = modal.querySelector(".hl-modal-pdf");
  pdf.hidden = true;
  body.innerHTML = "";
  body.removeAttribute("style");
  if (kind === "youtube") {
    const id = trigger.dataset.youtubeId;
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id || "")) return false;
    sound.hold("trailer");
  } else if (kind === "iframe") {
    const frame = document.createElement("iframe");
    frame.src = trigger.dataset.src;
    frame.title = title;
    body.appendChild(frame);
    if (trigger.dataset.pdf) {
      pdf.href = trigger.dataset.pdf;
      pdf.textContent = trigger.dataset.pdfLabel || "PDF";
      pdf.setAttribute("download", "");
      pdf.hidden = false;
    }
  } else if (kind === "image") {
    const img = document.createElement("img");
    img.src = trigger.dataset.src;
    img.alt = trigger.dataset.alt || "";
    body.appendChild(img);
  } else if (kind === "list") {
    const host = trigger.closest("[data-timeline]") || document;
    const src = host.querySelector(".tl-fallback .tl-list");
    if (!src) return false;
    body.appendChild(src.cloneNode(true));
  } else if (kind === "html") {
    const src = document.getElementById(trigger.dataset.modalTarget || "");
    if (!src) return false;
    const clone = src.cloneNode(true);
    clone.removeAttribute("hidden");
    clone.removeAttribute("id");
    body.appendChild(clone);
  } else {
    return false;
  }
  modal.classList.add(`is-${kind}`);
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const inerted = [];
  const keep = modal;
  const mark = (el) => {
    if (!el || el === keep || el.contains(keep) || el.hasAttribute("inert")) return;
    el.setAttribute("inert", "");
    inerted.push(el);
  };
  mark(document.querySelector(".site-chrome"));
  mark(document.querySelector(".skip"));
  const root = document.getElementById("page-root");
  if (root) [...root.children].forEach(mark);
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    } else if (e.key === "Tab") {
      trapTab(e, modal.querySelector(".hl-modal-window"));
    }
  };
  document.addEventListener("keydown", onKey, true);
  current = { modal, trigger, kind, inerted, onKey, player: null };
  if (kind === "youtube") {
    mountYoutube(modal, body, trigger.dataset.youtubeId, title);
  }
  modal.querySelector(".hl-modal-close").focus({ preventScroll: true });
  return true;
}

export function openTrailerIfRequested() {
  if (!document.body.classList.contains("open-trailer")) return false;
  const trigger = document.querySelector("[data-modal=youtube][data-youtube-id]");
  if (!trigger) return false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => openModal(trigger));
  });
  return true;
}

export function setupModals() {
  document.addEventListener("click", (e) => {
    const closer = e.target.closest && e.target.closest("[data-modal-close]");
    if (closer && current) {
      e.preventDefault();
      closeModal();
      return;
    }
    const trigger = e.target.closest && e.target.closest("[data-modal]");
    if (!trigger || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    if (openModal(trigger)) e.preventDefault();
  });
}

export function isModalOpen() {
  return !!current;
}
