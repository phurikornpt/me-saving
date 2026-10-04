"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Counts from the last shown value to the new one. The first render and reduced motion show the value as is. */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    if (reduce || current.current === value) return;
    const controls = animate(current.current, value, {
      duration: 0.4,
      ease: "easeOut",
      onUpdate: (v) => {
        current.current = v;
        setShown(Math.round(v));
      },
      onComplete: () => {
        current.current = value;
        setShown(value);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <>{format(reduce ? value : shown)}</>;
}
