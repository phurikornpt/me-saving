// "The user just logged for the first time today": a flag in memory (not storage) that the streak widget
// reads to play its reward. It is set when the save finishes and cleared once the widget has played it.
// If the page is reloaded in between, the reward is simply skipped; no data depends on it.

let firstToday = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const markFirstLogToday = () => {
  if (firstToday) return;
  firstToday = true;
  emit();
};
export const clearFirstLogToday = () => {
  if (!firstToday) return;
  firstToday = false;
  emit();
};

export const subscribeFirstLog = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
export const readFirstLog = () => firstToday;
