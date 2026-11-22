// Enter gate: black screen, the logo and ENTER. Shown on the first page of a
// browser session (the head script adds html.gate-on). A click or tap anywhere
// on it, or the Enter key, fades it out. The soundtrack starts inside that
// gesture when the hl_sound preference is on; there is no sound button here.
import { sound, syncSoundButtons } from "./sound.js";

const SESSION_KEY = "hl-entered";

export function setupEnterGate() {
  const root = document.documentElement;
  const gate = document.querySelector("[data-enter-gate]");
  if (!gate) return;
  if (!root.classList.contains("gate-on")) {
    gate.remove();
    return;
  }
  const behind = [document.querySelector(".site-chrome"), document.getElementById("page-root"), document.querySelector(".skip")].filter(Boolean);
  behind.forEach((el) => el.setAttribute("inert", ""));
  syncSoundButtons();
  const enterBtn = gate.querySelector("[data-gate-enter]");
  let leaving = false;

  const enter = () => {
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_err) { /* ignore */ }
    // Inside the gesture, so the browser lets the AudioContext start.
    if (sound.on) sound.start();
    behind.forEach((el) => el.removeAttribute("inert"));
    gate.classList.add("is-leaving");
    const done = () => {
      root.classList.remove("gate-on");
      gate.remove();
      document.removeEventListener("keydown", onKey, true);
      const target = document.getElementById("contenu");
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true, focusVisible: false });
      }
      window.dispatchEvent(new Event("hl:entered"));
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) done();
    else setTimeout(done, 750);
  };

  const onKey = (e) => {
    if (leaving) return;
    if (e.key === "Enter") {
      e.preventDefault();
      enter();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (enterBtn) enterBtn.focus();
    }
  };
  document.addEventListener("keydown", onKey, true);

  gate.addEventListener("click", () => {
    enter();
  });
  requestAnimationFrame(() => enterBtn && enterBtn.focus({ preventScroll: true }));
}
