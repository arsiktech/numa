import { describe, expect, it } from "vitest";
import { originalImageSize } from "./avatarUpload";
import { avatarPNG } from "../test/avatarFixture";
describe("avatar decoder preflight", () => {
  it("rejects compressed originals with excessive declared pixel allocation before browser decoding", () => {
    expect(originalImageSize(avatarPNG())).toEqual({ width: 1, height: 1 });
    expect(() => originalImageSize(avatarPNG({ width: 10000, height: 10000 }))).toThrow(/24 megapixels/);
    expect(() => originalImageSize(new ArrayBuffer(4))).toThrow();
  });
  it("reads GIF, JPEG and extended/lossless/lossy WebP dimensions", () => {
    const gif = new Uint8Array([71,73,70,56,57,97,10,0,20,0]);
    expect(originalImageSize(gif.buffer)).toEqual({ width: 10, height: 20 });
    const jpeg = new Uint8Array([255,216,255,192,0,11,8,0,20,0,10,1,1,17,0]);
    expect(originalImageSize(jpeg.buffer)).toEqual({ width: 10, height: 20 });
    for (const kind of ["VP8X", "VP8L", "VP8 "]) {
      const bytes = new Uint8Array(30), view = new DataView(bytes.buffer);
      bytes.set(new TextEncoder().encode("RIFF")); view.setUint32(4, 22, true);
      bytes.set(new TextEncoder().encode("WEBP"), 8); bytes.set(new TextEncoder().encode(kind), 12);
      view.setUint32(16, 10, true);
      if (kind === "VP8X") { bytes[24] = 9; bytes[27] = 19; }
      if (kind === "VP8L") { bytes[20] = 0x2f; view.setUint32(21, 9 | (19 << 14), true); }
      if (kind === "VP8 ") { bytes.set([0x9d,1,0x2a], 23); view.setUint16(26,10,true); view.setUint16(28,20,true); }
      expect(originalImageSize(bytes.buffer)).toEqual({ width: 10, height: 20 });
    }
  });
});
