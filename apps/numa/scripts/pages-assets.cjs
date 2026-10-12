#!/usr/bin/env node
/**
 * Cloudflare Pages never uploads folders named `node_modules`, but `expo export` puts font and
 * image assets under `dist/assets/node_modules/...`. On Pages those URLs fall through to
 * index.html, the fonts never load and the app stays blank.
 *
 * Run after `expo export --platform web`: moves the folder to `dist/assets/vendor` and rewrites
 * every reference in the exported files. Fails if any reference is left behind.
 */
const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(__dirname, '..', 'dist');
const from = path.join(dist, 'assets', 'node_modules');
const to = path.join(dist, 'assets', 'vendor');
const OLD = '/assets/node_modules/';
const NEW = '/assets/vendor/';

if (!fs.existsSync(dist)) {
  console.error('pages-assets: dist/ not found. Run expo export first.');
  process.exit(1);
}

if (fs.existsSync(from)) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
}

const textFile = /\.(js|html|json|css|map)$/;
let rewritten = 0;
const leftovers = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') leftovers.push(path.relative(dist, file));
      walk(file);
    } else if (textFile.test(entry.name)) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(OLD)) {
        fs.writeFileSync(file, text.split(OLD).join(NEW));
        rewritten += 1;
      }
      if (fs.readFileSync(file, 'utf8').includes('/node_modules/')) leftovers.push(path.relative(dist, file));
    }
  }
}

walk(dist);

if (leftovers.length) {
  console.error(`pages-assets: node_modules paths remain in:\n  ${leftovers.join('\n  ')}`);
  process.exit(1);
}
console.log(`pages-assets: moved assets to /assets/vendor, rewrote ${rewritten} file(s).`);
