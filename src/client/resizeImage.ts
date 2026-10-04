/**
 * How much to shrink a picture before upload. Receipts and phone screenshots both need to stay readable:
 * a normal photo is capped at 1600px on its long side, but a tall screenshot (an order page, a long
 * history) keeps at least ~900px of width, up to 4096px tall, or its text becomes unreadable.
 */
export function uploadScale(width: number, height: number): number {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return Math.min(1, 4096 / long, Math.max(1600 / long, 900 / short));
}

/** Shrinks a photo to a JPEG so the upload stays well under the 4.5 MB request limit. */
export async function resizeForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = uploadScale(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob) throw new Error("could not encode image");
  return blob;
}
