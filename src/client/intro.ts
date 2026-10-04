const KEY = "me-budget-intro";

/**
 * Runs in <head> before first paint: on the first open of "/" in this session, marks <html data-intro="play">
 * so the CSS intro (icon overlay, header rise, [+] pop) runs. Deciding here instead of in an effect means the
 * server-rendered overlay never flashes on pages or sessions that skip it. Keep it dependency-free.
 */
export const INTRO_INIT_SCRIPT = `(function(){try{if(location.pathname!=="/"||sessionStorage.getItem("${KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches)return;sessionStorage.setItem("${KEY}","1");document.documentElement.dataset.intro="play"}catch(e){}})()`;

export function introPlaying() {
  return typeof document !== "undefined" && document.documentElement.dataset.intro === "play";
}

/** Ends the intro (tap to skip, or once every part has played); removes all intro animations. */
export function endIntro() {
  delete document.documentElement.dataset.intro;
}
