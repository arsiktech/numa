import { crc32, deflateSync } from "node:zlib";

/** Synthetic PNG bytes only. CRC/DEFLATE use Node, independently of app parser. */
export function pngChunk(type: string, data: Uint8Array) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0); output.write(type, 4, 4, "ascii");
  output.set(data, 8); output.writeUInt32BE(crc32(output.subarray(4, data.length + 8)), data.length + 8);
  return output;
}
export function avatarPNG(options: { width?: number; height?: number; colorType?: number; metadata?: [string, Uint8Array]; pixel?: number } = {}): ArrayBuffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(options.width ?? 1, 0); header.writeUInt32BE(options.height ?? 1, 4);
  header[8] = 8; header[9] = options.colorType ?? 6;
  const chunks = [pngChunk("IHDR", header)];
  if (options.metadata) chunks.push(pngChunk(...options.metadata));
  chunks.push(pngChunk("IDAT", deflateSync(Buffer.from([0, options.pixel ?? 200, 20, 50, 255]))), pngChunk("IEND", new Uint8Array()));
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
  return Uint8Array.from(bytes).buffer;
}
