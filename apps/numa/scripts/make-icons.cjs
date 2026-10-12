// Draws the app icons, splash mark and favicon from one HTML template with the
// bundled Manrope font, using the repository's Playwright Chromium. Run from
// apps/numa: node scripts/make-icons.cjs  (E2E_CHROMIUM may point at a browser).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const { chromium } = require('module').createRequire(path.join(ROOT, 'package.json'))('playwright');

const OUT = path.join(__dirname, '../assets/images');
const PUBLIC = path.join(__dirname, '../public');
const FONT = path.join(__dirname, '../node_modules/@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf');
const OIL = ['#FF5FA2', '#9B6BFF', '#4CC9F0', '#5EF2B5', '#F4E46A', '#FF9A62'];
const oil = `linear-gradient(115deg, ${OIL.join(', ')})`;
const fontData = fs.readFileSync(FONT).toString('base64');

/** One square canvas. `glyph` is the "n" size as a share of the canvas; `chip` adds the oil-film pill. */
function page({ size, bg, ink, glyph, chip, word }) {
  const g = size * glyph;
  const mark = word
    ? `<div style="font-size:${size * 0.3}px;letter-spacing:${-size * 0.012}px;color:${ink}">numa</div>`
    : `<div style="display:flex;align-items:baseline;gap:${g * 0.05}px;transform:translateY(${-g * 0.1}px);font-size:${g}px;line-height:1;color:${ink};letter-spacing:${-g * 0.02}px">n${chip ? `<span style="display:inline-block;width:${g * 0.3}px;height:${g * 0.15}px;border-radius:${g}px;background:${oil};box-shadow:inset 0 ${g * 0.025}px ${g * 0.03}px rgba(255,255,255,.6)"></span>` : ''}</div>`;
  return `<!doctype html><html><head><style>
    @font-face { font-family: M; src: url(data:font/ttf;base64,${fontData}); }
    html, body { margin: 0; width: ${size}px; height: ${word ? size * 0.42 : size}px; background: ${bg}; }
    body { display: flex; align-items: center; justify-content: center; font-family: M; }
  </style></head><body>${mark}</body></html>`;
}

const jobs = [
  { file: 'icon.png', size: 1024, bg: '#000000', ink: '#F4F4F1', glyph: 0.62, chip: true },
  { file: 'android-icon-foreground.png', size: 512, bg: 'transparent', ink: '#F4F4F1', glyph: 0.4, chip: true },
  { file: 'android-icon-background.png', size: 512, bg: '#000000', ink: '#000000', glyph: 0 },
  { file: 'android-icon-monochrome.png', size: 432, bg: 'transparent', ink: '#FFFFFF', glyph: 0.4, chip: false },
  { file: 'favicon.png', size: 48, bg: '#000000', ink: '#F4F4F1', glyph: 0.7, chip: true },
  { file: 'splash-icon.png', size: 600, bg: 'transparent', ink: '#F4F4F1', word: true },
  { file: 'apple-touch-icon.png', dir: PUBLIC, size: 180, bg: '#000000', ink: '#F4F4F1', glyph: 0.62, chip: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined });
  for (const job of jobs) {
    const p = await browser.newPage({ viewport: { width: job.size, height: job.word ? Math.round(job.size * 0.42) : job.size } });
    await p.setContent(job.glyph === 0 ? page({ ...job, glyph: 0.01 }).replace('>n<', '><') : page(job));
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(job.dir ?? OUT, job.file), omitBackground: job.bg === 'transparent' });
    await p.close();
    console.log('wrote', job.file);
  }
  await browser.close();
})();
