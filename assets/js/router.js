// Lightweight client-side router: internal links swap the page content
// instead of reloading, so the soundtrack (and its mute state) keeps going.
// Anything unusual (other origin, files, new tab, modifier keys, a page
// without #page-root, a network error) falls back to normal navigation.

let navId = 0;
let currentPath = location.pathname + location.search;
let hooks = { before() {}, after() {} };

function isRoutable(url) {
  if (url.origin !== location.origin) return false;
  if (!/(\/|\.html)$/.test(url.pathname)) return false; // files: PDF, images, video
  if (/^\/(?:[a-z]{2}\/)?(?:edit|espace-pro)\//.test(url.pathname)) return false;
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/assets/")) return false;
  return true;
}

function saveScroll() {
  try {
    history.replaceState({ ...(history.state || {}), hl: 1, y: window.scrollY || 0 }, "");
  } catch (_err) {
    /* ignore */
  }
}

function syncHead(doc) {
  document.title = doc.title;
  const html = document.documentElement;
  html.lang = doc.documentElement.lang;
  html.dir = doc.documentElement.dir || "ltr";
  const head = document.head;
  head.querySelectorAll('link[rel="alternate"], meta[name="description"], meta[name="robots"]').forEach((el) => el.remove());
  const anchor = head.querySelector('link[rel="stylesheet"]');
  doc.head.querySelectorAll('link[rel="alternate"], meta[name="description"], meta[name="robots"]').forEach((el) => {
    head.insertBefore(document.importNode(el, true), anchor);
  });
}

function syncChrome(doc) {
  const set = (sel, fn) => {
    const a = document.querySelector(sel);
    const b = doc.querySelector(sel);
    if (a && b) fn(a, b);
  };
  set(".site-header .nav", (a, b) => { a.innerHTML = b.innerHTML; });
  set(".site-header .logo", (a, b) => { a.setAttribute("href", b.getAttribute("href")); });
  set(".skip", (a, b) => { a.textContent = b.textContent; });
  set(".nav-toggle", (a, b) => {
    a.setAttribute("aria-label", b.getAttribute("aria-label") || "");
    a.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".snd-toggle").forEach((btn) => {
    const src = doc.querySelector(".snd-toggle");
    if (!src) return;
    btn.dataset.labelMute = src.dataset.labelMute || "";
    btn.dataset.labelUnmute = src.dataset.labelUnmute || "";
  });
  set(".lang-switch-btn", (a, b) => {
    a.setAttribute("aria-label", b.getAttribute("aria-label") || "");
    a.setAttribute("title", b.getAttribute("title") || "");
    a.setAttribute("aria-expanded", "false");
    const cur = a.querySelector(".lang-current");
    const nxt = b.querySelector(".lang-current");
    if (cur && nxt) cur.textContent = nxt.textContent;
  });
  set(".lang-menu-title", (a, b) => { a.textContent = b.textContent; });
  set(".lang-menu-close", (a, b) => { a.setAttribute("aria-label", b.getAttribute("aria-label") || ""); });
  set(".lang-menu-panel", (a, b) => { a.setAttribute("aria-label", b.getAttribute("aria-label") || ""); });
  const menu = document.getElementById("lang-menu");
  if (menu) menu.hidden = true;
  const next = [...doc.querySelectorAll(".lang-option")];
  document.querySelectorAll("[data-section-step]").forEach((btn) => {
    const src = doc.querySelector(`[data-section-step="${btn.getAttribute("data-section-step")}"]`);
    if (src && src.getAttribute("aria-label")) btn.setAttribute("aria-label", src.getAttribute("aria-label"));
  });
  document.querySelectorAll(".lang-option").forEach((opt, i) => {
    const src = next.find((n) => n.getAttribute("hreflang") === opt.getAttribute("hreflang")) || next[i];
    if (!src) return;
    opt.setAttribute("href", src.getAttribute("href"));
    if (src.hasAttribute("aria-current")) opt.setAttribute("aria-current", "true");
    else opt.removeAttribute("aria-current");
  });
}

export async function navigate(href, { push = true, y = 0 } = {}) {
  const url = new URL(href, location.href);
  const id = ++navId;
  if (push) saveScroll();
  const root = document.getElementById("page-root");
  if (root) root.classList.add("is-leaving");
  let doc;
  let finalUrl = url;
  try {
    const res = await fetch(url.href, { headers: { Accept: "text/html" }, credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    if (res.redirected) finalUrl = new URL(res.url);
    doc = new DOMParser().parseFromString(await res.text(), "text/html");
  } catch (_err) {
    location.assign(url.href);
    return;
  }
  if (id !== navId) return;
  const nextRoot = doc.getElementById("page-root");
  if (!nextRoot || !root || !doc.querySelector(".site-chrome")) {
    location.assign(url.href);
    return;
  }
  if (finalUrl.hash === "" && url.hash) finalUrl.hash = url.hash;
  hooks.before();
  syncHead(doc);
  syncChrome(doc);
  document.body.className = doc.body.className;
  if (doc.body.dataset.lang) document.body.dataset.lang = doc.body.dataset.lang;
  root.innerHTML = nextRoot.innerHTML;
  if (push) history.pushState({ hl: 1, y: 0 }, "", finalUrl.href);
  currentPath = location.pathname + location.search;
  try { localStorage.setItem("hl-lang", document.body.dataset.lang || ""); } catch (_err) { /* ignore */ }
  root.classList.remove("is-leaving");
  hooks.after({ y: push ? 0 : y, hash: finalUrl.hash, land: push });
  window.dispatchEvent(new CustomEvent("hl:navigated", { detail: { url: finalUrl.href } }));
}

export function setupRouter(nextHooks) {
  if (!window.fetch || !window.DOMParser || !history.pushState) return;
  if (document.documentElement.classList.contains("is-embed")) return;
  hooks = { ...hooks, ...nextHooks };
  try { history.scrollRestoration = "manual"; } catch (_err) { /* ignore */ }
  saveScroll();
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.hasAttribute("data-modal") || a.hasAttribute("data-no-router")) return;
    const url = new URL(a.href, location.href);
    if (!isRoutable(url)) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) return; // in-page anchor: handled by section scroll
      e.preventDefault();
      document.body.classList.remove("nav-open", "lang-menu-open");
      if (window.__hlSectionScroll) window.__hlSectionScroll.reset(0, "", { land: true });
      return;
    }
    e.preventDefault();
    navigate(url.href, { push: true });
  });
  window.addEventListener("popstate", (e) => {
    if (location.pathname + location.search === currentPath) return; // hash-only change
    const st = e.state || {};
    navigate(location.href, { push: false, y: typeof st.y === "number" ? st.y : 0 });
  });
  window.__hlRouter = {
    navigate,
    syncPath() { currentPath = location.pathname + location.search; },
  };
}
