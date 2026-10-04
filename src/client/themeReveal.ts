import { motionReduced } from "./motionPref";
import { setTheme, type ThemePref } from "./theme";

/** Radius of the circle that, centred on (x, y), just covers a w x h screen: the distance to the farthest corner. */
export const revealRadius = (x: number, y: number, w: number, h: number) =>
  Math.hypot(Math.max(x, w - x), Math.max(y, h - y));

type WithTransition = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> } };

/**
 * Switches the theme with the new colours growing as a circle out of the tapped point (View Transitions API).
 * Where that API is missing, or motion is reduced, it just switches.
 */
export function setThemeWithReveal(pref: ThemePref, x: number, y: number) {
  const doc = document as WithTransition;
  if (!doc.startViewTransition || motionReduced()) return setTheme(pref);
  const root = document.documentElement;
  root.classList.add("theme-reveal");
  const vt = doc.startViewTransition(() => setTheme(pref));
  const r = revealRadius(x, y, window.innerWidth, window.innerHeight);
  void vt.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 550, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
  void vt.finished.finally(() => root.classList.remove("theme-reveal"));
}
