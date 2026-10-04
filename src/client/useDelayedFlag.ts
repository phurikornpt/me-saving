"use client";

import { useEffect, useRef, useState } from "react";
import { createDelayedFlag } from "./motion";

/** true while `active`, but only after `delay` ms and for at least `min` ms, so a quick load shows no cue at all. */
export function useDelayedFlag(active: boolean, delay = 150, min = 400) {
  const [shown, setShown] = useState(false);
  const flag = useRef<ReturnType<typeof createDelayedFlag> | null>(null);
  useEffect(() => {
    const f = createDelayedFlag(delay, min, setShown);
    flag.current = f;
    return () => f.dispose();
  }, [delay, min]);
  useEffect(() => flag.current?.set(active), [active, delay, min]);
  return shown;
}

/**
 * true once data has arrived after we had to wait for it. Use it to fade content in only when a placeholder
 * stood in before, so data that was already cached appears at once with no animation.
 */
export function useArrivedLate(pending: boolean) {
  const [waited, setWaited] = useState(pending);
  if (pending && !waited) setWaited(true);
  return waited && !pending;
}
