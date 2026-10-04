// Short-lived "this just happened" flags, held in memory (not storage), that the widgets read to play a small
// reward and then let go. If the page reloads in between the reward is simply skipped; no data depends on it.

interface Flag {
  mark: () => void;
  clear: () => void;
  subscribe: (cb: () => void) => () => void;
  read: () => boolean;
}

/** A flag that stays on until cleared, or (with `autoClearMs`) clears itself. Subscribers hear only real changes. */
function createFlag(autoClearMs?: number): Flag {
  let on = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const clear = () => {
    clearTimeout(timer);
    if (!on) return;
    on = false;
    emit();
  };
  return {
    mark: () => {
      clearTimeout(timer);
      if (autoClearMs !== undefined) timer = setTimeout(clear, autoClearMs);
      if (on) return;
      on = true;
      emit();
    },
    clear,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    read: () => on,
  };
}

/** First log of the day: the streak widget plays its reward once it shows today lit, then clears this. */
const firstToday = createFlag();
export const markFirstLogToday = firstToday.mark;
export const clearFirstLogToday = firstToday.clear;
export const subscribeFirstLog = firstToday.subscribe;
export const readFirstLog = firstToday.read;

/** Any log: the newest row of "recent" glows for a moment. */
const fresh = createFlag(2400);
export const markEntryLogged = fresh.mark;
export const subscribeEntryLogged = fresh.subscribe;
export const readEntryLogged = fresh.read;

/** A no-spend day was just logged: today's calendar cell pops. */
const noSpend = createFlag(2400);
export const markNoSpendLogged = noSpend.mark;
export const subscribeNoSpendLogged = noSpend.subscribe;
export const readNoSpendLogged = noSpend.read;

// exported for tests
export const _createFlag = createFlag;
