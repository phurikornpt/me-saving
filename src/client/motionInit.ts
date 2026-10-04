// Kept apart from motionPref.ts: the root layout (a server component) imports this, and must not pull in React hooks.

export const MOTION_KEY = "me-budget-motion";

/** Runs in <head> before first paint, marking <html data-motion="reduce"> when the user chose it on this device. */
export const MOTION_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${MOTION_KEY}")==="reduce")document.documentElement.dataset.motion="reduce"}catch(e){}})()`;
