// The photo is picked inside the wheel's pointer-up (a user gesture, so the camera/picker may open),
// then handed to /scan in memory. It is never persisted anywhere.
let pending: File | null = null;
export const setPendingReceipt = (f: File | null) => void (pending = f);
export const takePendingReceipt = (): File | null => {
  const f = pending;
  pending = null;
  return f;
};
