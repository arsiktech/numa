import { ConvexError } from "convex/values";

export const AVATAR_MAX_EDGE = 256;
export const AVATAR_MAX_BYTES = 300 * 1024;
export const AVATAR_ORIGINAL_MAX_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function invalid(): never {
  throw new ConvexError({ code: "INVALID_AVATAR", message: "Choose a still image that can be converted to a small PNG profile photo." });
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate a bounded PNG container/dimensions and keep only image chunks.
 * Client canvas normalizes pixels; this server boundary independently strips
 * EXIF, text, ICC and all other ancillary metadata. Not a general image decoder. */
export function normalizeAvatarPNG(input: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(input);
  if (bytes.length > AVATAR_MAX_BYTES || bytes.length < 57 || PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) invalid();
  const view = new DataView(input);
  const parts = [bytes.slice(0, 8)];
  let offset = 8, sawHeader = false, sawData = false, sawEnd = false, dataEnded = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) invalid();
    const end = offset + length + 12;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) invalid();
    if (view.getUint32(end - 4) !== crc32(bytes.subarray(offset + 4, end - 4))) invalid();
    if (!sawHeader && type !== "IHDR") invalid();
    if (type === "IHDR") {
      if (sawHeader || length !== 13) invalid();
      const width = view.getUint32(offset + 8), height = view.getUint32(offset + 12);
      if (width < 1 || height < 1 || width > AVATAR_MAX_EDGE || height > AVATAR_MAX_EDGE) invalid();
      // Canvas emits non-interlaced eight-bit RGB/RGBA, not palettes/animation.
      if (bytes[offset + 16] !== 8 || ![2, 6].includes(bytes[offset + 17]) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) invalid();
      sawHeader = true;
    } else if (type === "IDAT") {
      if (dataEnded || length === 0) invalid();
      sawData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !sawData || end !== bytes.length) invalid();
      sawEnd = true;
    } else {
      if (sawData) dataEnded = true;
      // No animation, palette, unknown critical chunks, or trailing payloads.
      if (["acTL", "fcTL", "fdAT"].includes(type) || type[0] === type[0].toUpperCase()) invalid();
    }
    if (["IHDR", "IDAT", "IEND"].includes(type)) parts.push(bytes.slice(offset, end));
    offset = end;
  }
  if (!sawEnd || offset !== bytes.length) invalid();
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0; for (const part of parts) { output.set(part, at); at += part.length; }
  return output.buffer;
}

export function avatarDataURL(bytes: ArrayBuffer): string {
  const value = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < value.length; i += 4096) binary += String.fromCharCode(...value.subarray(i, i + 4096));
  return `data:image/png;base64,${btoa(binary)}`;
}

export async function avatarDigest(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
