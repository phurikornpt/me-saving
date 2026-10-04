import { useSyncExternalStore } from "react";

// "Reduce motion" for this device. Off = follow the system setting; on = reduce whatever the system says.
// Kept in localStorage like the theme, and mirrored onto <html data-motion="reduce"> before first paint
// so the CSS rules can switch animations off without waiting for React.

export type MotionPref = "system" | "reduce";

const KEY = "me-budget-motion";
const EVENT = "me-budget:motion";
const MEDIA = "(prefers-reduced-motion: reduce)";

/** Runs in <head> before first paint. Keep it dependency-free. */
export const MOTION_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${KEY}")==="reduce")document.documentElement.dataset.motion="reduce"}catch(e){}})()`;

/** Motion is reduced when the user asked for it here, or the system asks for it. */
export const resolveReduced = (pref: MotionPref, systemReduces: boolean): boolean => pref === "reduce" || systemReduces;

export function readMotionPref(): MotionPref {
  try {
    return window.localStorage.getItem(KEY) === "reduce" ? "reduce" : "system";
  } catch {
    return "system";
  }
}

export function setMotionPref(pref: MotionPref) {
  try {
    if (pref === "reduce") window.localStorage.setItem(KEY, "reduce");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: the choice just won't persist */
  }
  if (pref === "reduce") document.documentElement.dataset.motion = "reduce";
  else delete document.documentElement.dataset.motion;
  window.dispatchEvent(new Event(EVENT));
}

export const systemReducesMotion = () => typeof window !== "undefined" && window.matchMedia(MEDIA).matches;

/** For code that draws on its own (canvas, vibration): the current answer, read when called. */
export const motionReduced = () => resolveReduced(readMotionPref(), systemReducesMotion());

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MEDIA);
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

/** The user's own choice (not the system's). */
export const useMotionPref = () => useSyncExternalStore(subscribe, readMotionPref, (): MotionPref => "system");
/** Whether motion should be reduced right now, for any reason. */
export const useMotionReduced = () => useSyncExternalStore(subscribe, motionReduced, () => false);
