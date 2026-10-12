import { AVATAR_MAX_BYTES, AVATAR_MAX_EDGE, AVATAR_ORIGINAL_MAX_BYTES, normalizeAvatarPNG } from "../../convex/lib/avatarImage";

const MAX_ORIGINAL_PIXELS = 24_000_000;
const MAX_ORIGINAL_EDGE = 10000;
const unsupported = () => new Error("Choose a PNG, JPEG, WebP or GIF photo under 5 MB and 24 megapixels.");

/** Inspect dimensions before invoking an image decoder; a small compressed
 * file alone does not bound decoded memory. WebP fields follow the RIFF spec:
 * https://developers.google.com/speed/webp/docs/riff_container */
export function originalImageSize(bytes: ArrayBuffer): { width: number; height: number } {
  const b = new Uint8Array(bytes), v = new DataView(bytes);
  const text = (at: number, size: number) => String.fromCharCode(...b.subarray(at, at + size));
  let width = 0, height = 0;
  if (b.length >= 24 && text(1, 3) === "PNG" && b[0] === 137 && text(12, 4) === "IHDR") {
    width = v.getUint32(16); height = v.getUint32(20);
  } else if (b.length >= 10 && ["GIF87a", "GIF89a"].includes(text(0, 6))) {
    width = v.getUint16(6, true); height = v.getUint16(8, true);
  } else if (b.length >= 30 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    if (v.getUint32(4, true) + 8 !== b.length) throw unsupported();
    const chunk = text(12, 4);
    if (chunk === "VP8X") {
      width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
    } else if (chunk === "VP8L" && b[20] === 0x2f) {
      const bits = v.getUint32(21, true); width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
    } else if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a) {
      width = v.getUint16(26, true) & 0x3fff; height = v.getUint16(28, true) & 0x3fff;
    }
  } else if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= b.length) {
      if (b[offset++] !== 0xff) throw unsupported();
      while (b[offset] === 0xff) offset++;
      const marker = b[offset++];
      if (marker === 0xda || marker === 0xd9 || offset + 2 > b.length) break;
      const length = v.getUint16(offset);
      if (length < 2 || offset + length > b.length) throw unsupported();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw unsupported();
        height = v.getUint16(offset + 3); width = v.getUint16(offset + 5); break;
      }
      offset += length;
    }
  }
  if (width < 1 || height < 1 || width > MAX_ORIGINAL_EDGE || height > MAX_ORIGINAL_EDGE || width * height > MAX_ORIGINAL_PIXELS) throw unsupported();
  return { width, height };
}

/** The original never leaves this device. Only cropped thumbnail pixels are
 * sent by the caller. Cancellation releases both object URL and canvas. */
export async function prepareAvatar(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
  if (file.size > AVATAR_ORIGINAL_MAX_BYTES || file.size === 0) throw unsupported();
  originalImageSize(await file.arrayBuffer());
  signal.throwIfAborted();
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  const abort = () => { image.src = ""; };
  try {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => reject(new DOMException("Canceled", "AbortError"));
      image.onload = () => { signal.removeEventListener("abort", cancel); resolve(); };
      image.onerror = () => { signal.removeEventListener("abort", cancel); reject(unsupported()); };
      signal.addEventListener("abort", cancel, { once: true });
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
    });
    signal.throwIfAborted();
    if (image.naturalWidth < 1 || image.naturalHeight < 1 || image.naturalWidth * image.naturalHeight > MAX_ORIGINAL_PIXELS) throw unsupported();
    canvas.width = canvas.height = AVATAR_MAX_EDGE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this photo. Try another browser.");
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, AVATAR_MAX_EDGE, AVATAR_MAX_EDGE);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(unsupported()), "image/png"));
    signal.throwIfAborted();
    if (blob.size > AVATAR_MAX_BYTES) throw unsupported();
    return normalizeAvatarPNG(await blob.arrayBuffer());
  } finally {
    signal.removeEventListener("abort", abort);
    image.onload = image.onerror = null; image.src = "";
    URL.revokeObjectURL(url); canvas.width = canvas.height = 0;
  }
}
