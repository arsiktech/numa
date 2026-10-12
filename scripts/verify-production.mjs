const productionUrl = new URL(process.env.NUMA_PRODUCTION_URL ?? "https://numa-ecru.vercel.app");
const requireConvex =
  process.argv.includes("--require-convex") ||
  ["1", "true", "yes"].includes((process.env.REQUIRE_CONVEX ?? "").toLowerCase());

const checks = [];

async function main() {
  const html = await fetchText("/");
  assert(/<title>\s*Numa\b/i.test(html), "Production HTML includes the Numa title");

  const assetPaths = [
    ...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)
  ].map((match) => match[1]);
  assert(assetPaths.length > 0, "Production HTML references a JavaScript bundle");

  const bundles = await Promise.all(assetPaths.map((assetPath) => fetchText(assetPath)));
  const joinedBundles = bundles.join("\n");
  const hasConvexCloudUrl = /https:\/\/[a-z0-9-]+\.convex\.cloud/i.test(joinedBundles);
  const hasLocalConvexUrl = /https?:\/\/127\.0\.0\.1:321[01]/.test(joinedBundles);
  assert(!hasLocalConvexUrl, "Production bundle does not contain local Convex URLs");

  if (requireConvex) {
    assert(
      hasConvexCloudUrl,
      "Production bundle contains a Convex cloud URL",
      "Production bundle is missing a Convex cloud URL"
    );
  } else {
    checks.push({
      ok: hasConvexCloudUrl,
      label: hasConvexCloudUrl
        ? "Production bundle contains a Convex cloud URL"
        : "Production bundle does not yet contain a Convex cloud URL"
    });
  }

  const quotes = await fetchJson("/api/market-quotes?symbols=BTC,AAPL");
  // AAPL needs FINNHUB_API_KEY in production. Set NUMA_EXPECT_EQUITY_QUOTES=1
  // once that key exists so a broken stock feed fails this check loudly.
  const requiredSymbols = process.env.NUMA_EXPECT_EQUITY_QUOTES === "1" ? ["BTC", "AAPL"] : ["BTC"];
  for (const symbol of requiredSymbols) {
    const quote = quotes.quotes?.[symbol];
    assert(Number.isFinite(quote?.price) && quote.price > 0, `${symbol} market quote returns a positive price`);
    assert(Boolean(quote?.provider), `${symbol} market quote includes a provider`);
  }
  if (!requiredSymbols.includes("AAPL")) {
    checks.push({
      ok: Boolean(quotes.quotes?.AAPL),
      label: quotes.quotes?.AAPL ? "AAPL equity quote is available" : "AAPL equity quote unavailable (FINNHUB_API_KEY not configured?)"
    });
  }

  const fx = await fetchJson("/api/fx-rates");
  assert(fx.base === "EUR", "FX rates use EUR as the base currency");
  assert(Number.isFinite(fx.rates?.EUR) && fx.rates.EUR === 1, "FX rates include EUR at 1");
  assert(Number.isFinite(fx.rates?.USD) && fx.rates.USD > 0, "FX rates include a positive USD rate");
  assert(Boolean(fx.provider), "FX rates include a provider");

  for (const check of checks) {
    const prefix = check.ok ? "ok" : "info";
    console.log(`${prefix} - ${check.label}`);
  }
}

async function fetchText(path) {
  const response = await fetchUrl(path);
  return response.text();
}

async function fetchJson(path) {
  const response = await fetchUrl(path);
  return response.json();
}

async function fetchUrl(path) {
  const url = new URL(path, productionUrl);
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(`${url.toString()} could not be fetched: ${describeError(error)}`, {
      cause: error
    });
  }
  if (!response.ok) {
    throw new Error(`${url.toString()} returned ${response.status}`);
  }
  return response;
}

function assert(condition, label, failureMessage = label) {
  if (!condition) {
    throw new Error(failureMessage);
  }
  checks.push({ ok: true, label });
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.message}${cause}`;
}

main().catch((error) => {
  console.error(`Production verification failed: ${error.message}`);
  process.exitCode = 1;
});
