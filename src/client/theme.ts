export type ThemePref = "system" | "light" | "dark";

const KEY = "me-budget-theme";
const EVENT = "me-budget:theme";

/** Runs in <head> before first paint so a dark phone never flashes white. Keep it dependency-free. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})()`;

export function readTheme(): ThemePref {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(pref: ThemePref) {
  try {
    if (pref === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, pref);
  } catch {
    /* private mode: the choice just won't persist */
  }
  if (pref === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTheme(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
