import { api } from "./api";

// Warms the function and the DB so the first real request after idle isn't a cold start.
// Fire-and-forget, at most once a minute.
let last = 0;
export function wake() {
  const now = Date.now();
  if (now - last < 60_000) return;
  last = now;
  void api.wake();
}
