// Persistent soundtrack. Lives for the whole visit: the client-side router
// swaps page content but never this module, so the loop and its state keep
// going across internal navigation.
//
// Sound preference is one cookie, used by the menu-bar mute button and when
// the enter gate starts playback: hl_sound=on|off (path=/, one year, SameSite=Lax).

const COOKIE = "hl_sound";
const LEGACY_MUTE_KEY = "hl-soundtrack-muted";
const SOURCES = ["/assets/audio/soundtrack.webm", "/assets/audio/soundtrack.m4a"];

function readCookie() {
  const m = document.cookie.match(/(?:^|;\s*)hl_sound=(on|off)\b/);
  return m ? m[1] : "";
}

function writeCookie(value) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

function initialOn() {
  const c = readCookie();
  if (c) return c === "on";
  try {
    if (localStorage.getItem(LEGACY_MUTE_KEY) === "1") return false;
  } catch (_err) {
    /* private mode */
  }
  return true;
}

function trimCodecPadding(ctx, buffer) {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const len = buffer.length;
  const thr = 0.001;
  let start = 0;
  let end = len;
  const loudAt = (i) => {
    for (let c = 0; c < channels; c++) if (Math.abs(buffer.getChannelData(c)[i]) >= thr) return true;
    return false;
  };
  while (start < end && !loudAt(start)) start += 1;
  while (end > start && !loudAt(end - 1)) end -= 1;
  // Never trim more than 80 ms of codec padding
  const cap = Math.floor(rate * 0.08);
  if (start > cap) start = 0;
  if (len - end > cap) end = len;
  if (start === 0 && end === len) return buffer;
  const outLen = end - start;
  if (outLen < rate) return buffer;
  const out = ctx.createBuffer(channels, outLen, rate);
  for (let c = 0; c < channels; c++) out.getChannelData(c).set(buffer.getChannelData(c).subarray(start, end));
  return out;
}

async function decodeSoundtrack(ctx, urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(data.slice(0));
      return trimCodecPadding(ctx, decoded);
    } catch (_err) {
      /* try the next format */
    }
  }
  return null;
}

// The dossier opens inside the modal as an embedded page: it must stay silent.
const EMBED = document.documentElement.classList.contains("is-embed");
const AudioCtx = EMBED ? null : window.AudioContext || window.webkitAudioContext;
let on = initialOn();
let ctx = null;
let gain = null;
let started = false;
let loading = null;
const holds = new Set();
const listeners = new Set();
let instanceId = 0;

const ensure = () => {
  if (!AudioCtx) return Promise.resolve(false);
  if (started) return Promise.resolve(true);
  if (loading) return loading;
  if (!ctx) {
    ctx = new AudioCtx();
    instanceId = Math.floor(Math.random() * 1e9);
    gain = ctx.createGain();
    gain.gain.value = on ? 1 : 0;
    gain.connect(ctx.destination);
  }
  loading = (async () => {
    const buffer = await decodeSoundtrack(ctx, SOURCES);
    if (!buffer) {
      loading = null;
      return false;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(0);
    started = true;
    return true;
  })();
  return loading;
};

const shouldPlay = () => on && !holds.size && !document.hidden;

async function apply() {
  if (!ctx) return;
  gain.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
  try {
    if (shouldPlay() && started) {
      if (ctx.state === "suspended") await ctx.resume();
    } else if (ctx.state === "running" && (holds.size || document.hidden)) {
      await ctx.suspend();
    }
  } catch (_err) {
    /* autoplay still blocked until the next gesture */
  }
}

function notify() {
  for (const fn of listeners) fn(on);
}

export const sound = {
  get on() { return on; },
  setOn(next) {
    on = !!next;
    writeCookie(on ? "on" : "off");
    try { localStorage.setItem(LEGACY_MUTE_KEY, on ? "0" : "1"); } catch (_err) { /* ignore */ }
    notify();
    if (on) this.start();
    else apply();
  },
  /** Call from a user gesture. Starts the loop if sound is on. */
  async start() {
    if (!on || holds.size) return;
    const ok = await ensure();
    if (!ok) return;
    await apply();
  },
  hold(reason) {
    holds.add(reason);
    apply();
  },
  release(reason) {
    holds.delete(reason);
    apply();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** For tests: the AudioContext survives router navigation. */
  debug() {
    return { on, started, state: ctx ? ctx.state : "none", time: ctx ? ctx.currentTime : 0, instanceId, holds: [...holds] };
  },
};

document.addEventListener("visibilitychange", () => apply());

// Fallback when the gate is skipped (same session, full reload): the first
// gesture anywhere starts the loop, as before.
const onFirstGesture = (event) => {
  if (document.documentElement.classList.contains("gate-on")) return;
  if (event.target && event.target.closest && event.target.closest(".snd-toggle, [data-enter-gate], [data-modal]")) return;
  if (event.type === "keydown" && (event.metaKey || event.ctrlKey || event.altKey || ["Shift", "Meta", "Control", "Alt", "Tab"].includes(event.key))) return;
  if (started) return;
  sound.start();
};
if (!EMBED) {
  window.addEventListener("pointerdown", onFirstGesture, { capture: true, passive: true });
  window.addEventListener("keydown", onFirstGesture, true);
  window.addEventListener("touchstart", onFirstGesture, { capture: true, passive: true });
}

/** Menu bar button(s). aria-pressed="true" means muted (unchanged meaning). */
export function syncSoundButtons() {
  for (const btn of document.querySelectorAll(".snd-toggle")) {
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    btn.setAttribute("aria-label", on ? btn.dataset.labelMute || "" : btn.dataset.labelUnmute || "");
    btn.classList.toggle("is-muted", !on);
  }
}

export function setupSoundButtons() {
  sound.subscribe(syncSoundButtons);
  syncSoundButtons();
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".snd-toggle");
    if (!btn) return;
    sound.setOn(!on);
  });
}

window.__hlSound = sound;
