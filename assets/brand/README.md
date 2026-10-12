# Numa Pro brand assets

The active web mark is the gold/lime coin. The existing artwork and palette
remain unchanged; the customer-facing name is Numa Pro.

- `numa-coin-variations.png`: canonical render sheet used by
  [generate-icons.mjs](../../scripts/generate-icons.mjs). Its front and angled
  cells generate the shipped coin, favicon, PWA, and social assets.
- `numa-app-icon-source.png`: earlier pot-and-coin master, retained as design
  history; it does not drive the current web generator.
- `_legacy/`: earlier orbit art, retained as reference.

The duplicate source copies formerly under `artifacts/brand/` were identical
to the files here and were removed. Keep source art in this directory.

To regenerate the web coin assets locally:

```bash
node scripts/generate-icons.mjs
```

For social wordmark-only work, `node scripts/generate-icons.mjs --og-only`
reuses the shipped coin and updates only `public/og-image.png`. Inspect
generated output before shipping. Native assets have their own catalog under
`ios/Numa/`; this script does not regenerate that catalog.
