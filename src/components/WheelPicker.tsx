"use client";

import { useEffect, useRef } from "react";

export interface WheelItem {
  key: string;
  label: string;
  /** Can't be chosen (e.g. a time later today): shown struck through, the wheel moves off it. */
  disabled?: boolean;
  /** Small text beside the label ("5×"). */
  note?: string;
}

/**
 * An iOS-style scroll wheel: the item under the band is the value. Scroll (or drag) to change it,
 * or focus it and use the arrow keys. `axis="x"` lays it out sideways.
 */
export function WheelPicker({
  items,
  index,
  onChange,
  label,
  axis = "y",
  size = 40,
  visible = 5,
  className = "",
}: {
  items: WheelItem[];
  index: number;
  onChange: (i: number) => void;
  label: string;
  axis?: "x" | "y";
  /** Height (or width, sideways) of one item in px. */
  size?: number;
  /** How many items show at once (odd). */
  visible?: number;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const ours = useRef(0); // until when scroll events are our own scrollTo, not the user's
  const frame = useRef(0);
  const x = axis === "x";
  const pad = (size * (visible - 1)) / 2;

  // keep the scroll position on the value (when it changes from outside: a chip, typing, arrow keys)
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const target = index * size;
    const at = x ? node.scrollLeft : node.scrollTop;
    if (Math.abs(at - target) < 1) return;
    const first = !node.dataset.ready;
    node.dataset.ready = "1";
    ours.current = Date.now() + (first ? 100 : 500);
    node.scrollTo({ [x ? "left" : "top"]: target, behavior: first ? "auto" : "smooth" });
  }, [index, size, x]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onScroll = () => {
    if (Date.now() < ours.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = el.current;
      if (!node) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round((x ? node.scrollLeft : node.scrollTop) / size)));
      if (i !== index) onChange(i);
    });
  };

  const step = (by: number) => {
    let i = index + by;
    while (items[i]?.disabled) i += Math.sign(by);
    if (i >= 0 && i < items.length) onChange(i);
  };

  return (
    <div
      className={`relative ${className}`}
      style={x ? { width: "100%", height: size } : { height: size * visible }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full border border-white/25 bg-white/20"
        style={x ? { left: "50%", top: 0, width: size, height: size, marginLeft: -size / 2 } : { left: 0, right: 0, top: pad, height: size }}
      />
      <div
        ref={el}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={items.length - 1}
        aria-valuenow={index}
        aria-valuetext={items[index]?.label}
        onScroll={onScroll}
        onKeyDown={(e) => {
          const back = x ? "ArrowLeft" : "ArrowUp";
          const fwd = x ? "ArrowRight" : "ArrowDown";
          if (e.key === back || e.key === fwd) {
            e.preventDefault();
            step(e.key === fwd ? 1 : -1);
          }
        }}
        className={`absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          x ? "snap-x snap-mandatory overflow-x-auto overflow-y-hidden" : "snap-y snap-mandatory overflow-y-auto overflow-x-hidden"
        }`}
        style={{
          overscrollBehavior: "contain",
          maskImage: `linear-gradient(${x ? "90deg" : "180deg"}, transparent, #000 30%, #000 70%, transparent)`,
          WebkitMaskImage: `linear-gradient(${x ? "90deg" : "180deg"}, transparent, #000 30%, #000 70%, transparent)`,
        }}
      >
        <div className={x ? "flex w-max" : ""} style={x ? { paddingInline: `calc(50% - ${size / 2}px)` } : { paddingBlock: pad }}>
          {items.map((it, i) => {
            const on = i === index;
            return (
              <div
                key={it.key}
                onClick={() => !it.disabled && onChange(i)}
                className={`flex shrink-0 snap-center items-center justify-center gap-1 tabular-nums transition-[opacity,font-size] ${
                  on ? "text-lg font-semibold" : "text-base opacity-50"
                } ${it.disabled ? "line-through opacity-25" : ""}`}
                style={x ? { width: size, height: size } : { height: size }}
              >
                {it.label}
                {it.note && <span className="text-[11px] font-normal opacity-70">{it.note}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
