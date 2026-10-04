"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ToastInput {
  message: string;
  action?: { label: string; run: () => void };
  ms?: number;
  tone?: "ok" | "error";
}
interface Celebration {
  title: string;
  subtitle: string;
  icon: "local_fire_department" | "military_tech";
}

interface FeedbackApi {
  toast: (t: ToastInput) => void;
  xp: (amount: number) => void;
  celebrate: (c: Celebration) => void;
}

const Ctx = createContext<FeedbackApi | null>(null);
export const useFeedback = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFeedback outside FeedbackProvider");
  return v;
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const [bursts, setBursts] = useState<{ id: number; amount: number }[]>([]);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setToast({ ...t, id });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.ms ?? 5000);
  }, []);

  const xp = useCallback((amount: number) => {
    if (amount <= 0) return;
    const id = ++seq.current;
    setBursts((b) => [...b, { id, amount }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 900);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={{ toast: showToast, xp, celebrate: setCelebration }}>
      {children}

      {/* +XP floats up from the bottom; short and non-blocking (pointer-events-none) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-52 z-[60] flex justify-center">
        <AnimatePresence>
          {bursts.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: -50, scale: 1 }}
              exit={{ opacity: 0, y: -90 }}
              transition={{ duration: 0.55 }}
              className="absolute font-bold text-2xl text-xp"
            >
              +{b.amount} XP
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[70] flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`pointer-events-auto flex items-center gap-4 rounded-full px-5 py-3 text-sm shadow-lg ${
                toast.tone === "error" ? "bg-expense text-white" : "bg-ink text-[var(--on-ink)]"
              }`}
            >
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  className="relative overflow-hidden rounded-full bg-white/20 px-4 py-1.5 font-medium"
                  onClick={() => {
                    toast.action!.run();
                    setToast(null);
                  }}
                >
                  {/* the button is also the clock: this fill drains over the time the toast stays */}
                  <span
                    aria-hidden
                    className="toast-drain absolute inset-0 bg-primary/60 motion-reduce:hidden"
                    style={{ "--toast-ms": `${toast.ms ?? 5000}ms` } as React.CSSProperties}
                  />
                  <span className="relative">{toast.action.label}</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {celebration && (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Confetti />
            <motion.div
              initial={{ scale: 0.3, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 12 }}
              className="flex h-40 w-40 items-center justify-center rounded-full bg-streak shadow-[0_8px_0_#b6cf3a]"
            >
              <Icon name={celebration.icon} size={96} fill className="text-black" />
            </motion.div>
            <h2 className="text-3xl font-bold">{celebration.title}</h2>
            <p className="text-ink-2">{celebration.subtitle}</p>
            <button className="btn3d mt-6 w-full max-w-xs py-4 text-lg" onClick={() => setCelebration(null)}>
              ไปต่อ
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

const COLORS = ["#29cc57", "#d7f25a", "#f2603d", "#456dff", "#8b6cff"];
function Confetti() {
  // deterministic pseudo-random so SSR/CSR never disagree
  const pieces = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 0.07,
    size: 6 + (i % 4) * 3,
    color: COLORS[i % COLORS.length],
    drift: ((i * 53) % 60) - 30,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color }}
          initial={{ y: -40, opacity: 1, rotate: 0 }}
          animate={{ y: "105dvh", x: p.drift, opacity: 0.9, rotate: 540 }}
          transition={{ duration: 2.4 + (i % 5) * 0.2, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
