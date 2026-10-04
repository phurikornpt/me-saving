"use client";

import { useEffect, useRef } from "react";

export type CloudMode = "idle" | "listening" | "thinking";

const SIZE = 320; // canvas size in css px
type Rgb = [number, number, number];
const GREEN: Rgb = [41, 204, 87];
const BLUE: Rgb = [69, 109, 255];
const VIOLET: Rgb = [139, 108, 255];
const LIME: Rgb = [215, 242, 90];

/** Where each state settles: orbit speed, size, how far the blobs spread, 0..1 green->violet, brightness. */
const LOOK: Record<CloudMode, { spin: number; size: number; spread: number; think: number; energy: number }> = {
  idle: { spin: 0.4, size: 0.8, spread: 0.5, think: 0, energy: 0.35 },
  listening: { spin: 1, size: 1, spread: 1, think: 0, energy: 1 },
  thinking: { spin: 3.2, size: 0.72, spread: 0.35, think: 1, energy: 0.7 },
};

const BLOBS: { c: Rgb; fx: number; fy: number; ph: number; r: number }[] = [
  { c: GREEN, fx: 0.7, fy: 0.9, ph: 0, r: 0.34 },
  { c: BLUE, fx: 0.9, fy: 0.6, ph: 1.7, r: 0.33 },
  { c: VIOLET, fx: 0.5, fy: 1.1, ph: 3.1, r: 0.3 },
  { c: LIME, fx: 1.3, fy: 0.8, ph: 4.4, r: 0.22 },
  { c: GREEN, fx: 0.6, fy: 1.2, ph: 5.6, r: 0.3 },
  { c: BLUE, fx: 1.1, fy: 0.5, ph: 2.4, r: 0.26 },
];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * The voice screen's aurora: soft coloured lights drifting over each other. It breathes while idle, swells and
 * flickers with every recognised word while listening (`pulse` goes up by one per word), and pulls in and spins
 * in cooler colours while thinking. Pure decoration: the screen reads fine without it.
 */
export function AuroraCloud({ mode, pulse, className = "" }: { mode: CloudMode; pulse: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ mode, kick: 0 });

  useEffect(() => {
    live.current.mode = mode;
  }, [mode]);
  useEffect(() => {
    if (pulse > 0) live.current.kick = 0.55 + Math.random() * 0.45;
  }, [pulse]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const slow = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.15 : 1;
    const p = { spin: 0.4, size: 0.8, spread: 0.5, think: 0, energy: 0.35 };
    let amp = 0;
    let ang = 0;
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const target = LOOK[live.current.mode];
      const k = 1 - Math.pow(0.001, dt); // ease toward the state's look
      p.spin += (target.spin - p.spin) * k;
      p.size += (target.size - p.size) * k;
      p.spread += (target.spread - p.spread) * k;
      p.think += (target.think - p.think) * k;
      p.energy += (target.energy - p.energy) * k;
      amp += (live.current.kick - amp) * (1 - Math.pow(0.0005, dt));
      live.current.kick *= Math.pow(0.02, dt); // each word is a pulse that fades
      ang += dt * p.spin * slow;

      const t = now / 1000;
      const s = SIZE * p.size;
      const orbit = s * 0.26 * (p.spread + amp * 0.9);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = "lighter";
      BLOBS.forEach((b, i) => {
        const x = SIZE / 2 + Math.sin(ang * 0.6 * b.fx + b.ph) * orbit;
        const y = SIZE / 2 + Math.cos(ang * 0.6 * b.fy + b.ph * 1.3) * orbit * 0.9;
        const rad = s * b.r * (1 + amp * 0.5 + 0.06 * Math.sin(t * 2 + b.ph));
        // blobs lean toward the state's colours: green/lime while listening, blue/violet while thinking
        const lean = i % 2 ? mix(LIME, VIOLET, p.think) : mix(GREEN, BLUE, p.think);
        const col = mix(b.c, lean, p.think * 0.8);
        const alpha = (0.35 + 0.55 * p.energy) * (i === 3 ? 1 - p.think : 1);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, rgba(col, alpha));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      });
      const core = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, s * (0.2 + amp * 0.12));
      core.addColorStop(0, `rgba(255,255,255,${0.3 + amp * 0.4})`);
      core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvas} aria-hidden className={className} style={{ filter: "blur(10px) saturate(1.25)" }} />;
}
