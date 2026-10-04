"use client";

import { useEffect } from "react";
import { endIntro, introPlaying } from "@/client/intro";

// Last intro animation ([+] pop) ends ~1100ms after first paint; mount is never earlier than that paint.
const INTRO_MS = 1200;

/** App icon over the surface colour, shown only while <html data-intro="play">. Tap to skip. */
export function AppIntro() {
  // Clearing the flag afterwards stops the header/[+] animations replaying when "/" re-mounts on client navigation.
  useEffect(() => {
    if (!introPlaying()) return;
    const t = setTimeout(endIntro, INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div aria-hidden className="app-intro" onClick={endIntro}>
      <div className="app-intro-icon" />
    </div>
  );
}
