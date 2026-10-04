import { ViewTransition, type ReactNode } from "react";

/**
 * Slides a whole screen in and out. Navigations tagged "nav-forward" (see src/client/nav.ts) move left;
 * everything else (back buttons, router.back, redirects after saving) is treated as going back and moves right.
 * Must sit in a page, not a layout: layouts persist across navigations, so enter/exit would never fire.
 */
const types = { "nav-forward": "nav-forward", default: "nav-back" } as const;

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={types} exit={types} default="none">
      {children}
    </ViewTransition>
  );
}
