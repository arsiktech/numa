/**
 * Generate every brand asset Numa needs from the canonical coin render.
 *
 *   node scripts/generate-icons.mjs
 *
 * Canonical identity (2026-06-24): the photorealistic 3D coin — a gold/lime
 * coin isolated from `assets/brand/numa-coin-variations.png` (a 3×3, 1254px
 * render sheet). Re-running this script reproduces every shipped coin asset:
 * the in-app logo sources (numa-coin.png / numa-coin-front.png), the PWA +
 * favicon + apple-touch icons, and the social og:image. The legacy pot+coin and
 * orbit masters are archived (assets/brand/_legacy/) and no longer drive this.
 */
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const SHEET = "assets/brand/numa-coin-variations.png";
const CELL = 418; // 1254 / 3
const TAGLINE = "Track money.";
const CREAM = { r: 251, g: 247, b: 240, alpha: 1 };

// Cells in the 3×3 sheet as [col, row].
const TILT = [1, 0]; // the 3/4 hero angle (shows depth + ridged edge)
const FRONT = [0, 0]; // the symmetric face (crisper at tiny sizes)

async function ensureDir(file) {
  await mkdir(dirname(file), { recursive: true });
}

/**
 * Crop a coin cell, inset to drop the render tile's rounded corner, then
 * flood-fill the light background to transparent (BFS from the four corners,
 * tol≈46) — keeping the coin's soft contact shadow. Returns a PNG buffer.
 */
async function isolateCoin([col, row], inset = 20) {
  const cell = await sharp(SHEET)
    .extract({ left: col * CELL, top: row * CELL, width: CELL, height: CELL })
    .extract({ left: inset, top: inset, width: CELL - 2 * inset, height: CELL - 2 * inset })
    .png()
    .toBuffer();
  const img = sharp(cell);
  const { width: W, height: H } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const idx = (x, y) => (y * W + x) * 4;
  const corners = [
    [0, 0],
    [W - 1, 0],
    [0, H - 1],
    [W - 1, H - 1]
  ];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const [x, y] of corners) {
    const i = idx(x, y);
    br += raw[i];
    bg += raw[i + 1];
    bb += raw[i + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;
  const TOL = 46;
  const t2 = TOL * TOL;
  const near = (i) => {
    const a = raw[i] - br;
    const b = raw[i + 1] - bg;
    const c = raw[i + 2] - bb;
    return a * a + b * b + c * c < t2;
  };
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x += 1) stack.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y += 1) stack.push([0, y], [W - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!near(i)) continue;
    seen[p] = 1;
    raw[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

async function save(buf, out, label = "") {
  await ensureDir(out);
  await sharp(buf).toFile(out);
  console.log("✔", out, label);
}

/** Coin centered on a cream square — app icons + favicons. */
async function coinOnCream(coinBuf, size, coinPct, out) {
  const cz = Math.round(size * coinPct);
  const coin = await sharp(coinBuf)
    .resize(cz, cz, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await ensureDir(out);
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: coin, gravity: "center" }])
    .png()
    .toFile(out);
  console.log("✔", out, `(${size}×${size})`);
}

/** 1200×630 social card — the public site's paper / ink / orbit composition.
 * Run with --og-only to preserve all app icons and the canonical coin. */
async function ogImage(coinBuf, out) {
  await ensureDir(out);
  const artwork = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#fbfaf3" />
      <rect x="810" width="390" height="630" fill="#12120c" />
      <g stroke="#cfff23" fill="none" opacity=".45">
        <circle cx="1000" cy="320" r="230" />
        <ellipse cx="1000" cy="320" rx="230" ry="95" transform="rotate(-35 1000 320)" />
        <ellipse cx="1000" cy="320" rx="230" ry="95" transform="rotate(55 1000 320)" />
      </g>
      <circle cx="1190" cy="190" r="10" fill="#cfff23" />
      <circle cx="1000" cy="320" r="148" fill="#fbfaf3" />
      <g font-family="Arial, sans-serif" fill="#0f0f08">
        <text x="64" y="94" font-size="34" font-weight="700" letter-spacing="-1">Numa Pro</text>
        <text x="64" y="250" font-size="80" font-weight="700" letter-spacing="-4">${TAGLINE}</text>
        <text x="64" y="342" font-size="80" font-weight="700" letter-spacing="-4">Make room</text>
        <text x="64" y="434" font-size="80" font-weight="700" letter-spacing="-4">for living.</text>
        <text x="64" y="558" font-size="22" fill="#4d4d41">Your money, in perspective.</text>
      </g>
      <rect x="64" y="476" width="56" height="6" rx="3" fill="#bfe438" />
    </svg>
  `);
  const coin = await sharp(coinBuf).resize(270, 270).toBuffer();
  await sharp(artwork).composite([{ input: coin, top: 185, left: 865 }]).png().toFile(out);
  console.log("✔", out, "(1200×630 Numa Pro social card)");
}

async function main() {
  // Branding-only refresh: reuse the shipped coin; never rewrite icon files.
  if (process.argv.includes("--og-only")) {
    await ogImage(await readFile("public/numa-coin.png"), "public/og-image.png");
    return;
  }
  const front = await isolateCoin(FRONT);
  const tilt = await isolateCoin(TILT);

  // In-app logo sources (NumaCoinLogo)
  await save(tilt, "public/numa-coin.png", "(3/4 tilt logo)");
  await save(front, "public/numa-coin-front.png", "(face logo)");

  await Promise.all([
    // PWA — Android home screen + Web manifest
    coinOnCream(front, 192, 0.82, "public/icon-192.png"),
    coinOnCream(front, 512, 0.82, "public/icon-512.png"),
    // Maskable: OS clips to a shape, so generous live-area padding
    coinOnCream(front, 512, 0.6, "public/icon-maskable-512.png"),
    // iOS Safari home screen
    coinOnCream(front, 180, 0.82, "public/apple-touch-icon.png"),
    // Browser favicon — the face reads cleanest at 16–32px
    coinOnCream(front, 32, 0.86, "public/favicon-32.png"),
    coinOnCream(front, 16, 0.88, "public/favicon-16.png"),
    // Social share preview
    ogImage(tilt, "public/og-image.png")
  ]);
  console.log("All Numa brand assets generated from the coin render.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
