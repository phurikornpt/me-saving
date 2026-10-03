import type { ReactNode } from "react";

export function WidgetCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[24px] bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm text-ink-3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
