import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { loadEnv, type HtmlTagDescriptor } from "vite";

const devFallbackFxRates = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  RUB: 98,
  CHF: 0.95,
  JPY: 162,
  CAD: 1.46,
  AUD: 1.63
};

const devFallbackMarketQuotes: Record<string, { price: number; changePercent: number; provider: string }> = {
  BTC: { price: 103_500, changePercent: 0.6, provider: "mock" },
  ETH: { price: 3_750, changePercent: 0.4, provider: "mock" },
  AAPL: { price: 188.4, changePercent: 1.8, provider: "mock" },
  VOO: { price: 462.1, changePercent: 0.8, provider: "mock" },
  SPY: { price: 502.2, changePercent: 0.7, provider: "mock" }
};

function readDevJsonBody(request: import("node:http").IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (body.length < 32_000) body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

function devCryptoWalletSnapshot(now: number) {
  return {
    provider: "moralis",
    addressType: "evm",
    tokenValueUsd: 8_500,
    defiValueUsd: 6_000,
    debtValueUsd: 1_000,
    totalValueUsd: 13_500,
    tokens: [
      { id: "fixture|eth", chain: "0x1", chainName: "Ethereum", tokenAddress: "native", symbol: "ETH", name: "Ether", quantity: "2", priceUsd: 3_000, valueUsd: 6_000, change24h: 1.8, verified: true, suspectedSpam: false },
      { id: "fixture|usdc", chain: "0x2105", chainName: "Base", tokenAddress: "0xusdc", symbol: "USDC", name: "USD Coin", quantity: "2500", priceUsd: 1, valueUsd: 2_500, verified: true, suspectedSpam: false },
      { id: "fixture|spam", chain: "0x1", chainName: "Ethereum", tokenAddress: "0xspam", symbol: "CLAIM", name: "Claim reward", quantity: "1", valueUsd: 0.01, verified: false, suspectedSpam: true }
    ],
    defiPositions: [
      { id: "fixture|aave-supply", chain: "0x1", chainName: "Ethereum", protocol: "Aave V3", label: "lending", kind: "supplied", valueUsd: 4_000, assetValueUsd: 4_000, debtValueUsd: 0, apy: 3.2, healthFactor: 2.4, symbols: ["USDC"] },
      { id: "fixture|lido", chain: "0x1", chainName: "Ethereum", protocol: "Lido", label: "staking", kind: "staked", valueUsd: 2_000, assetValueUsd: 2_000, debtValueUsd: 0, apy: 2.8, symbols: ["stETH"] },
      { id: "fixture|aave-debt", chain: "0x1", chainName: "Ethereum", protocol: "Aave V3", label: "borrowed", kind: "borrowed", valueUsd: -1_000, assetValueUsd: 0, debtValueUsd: 1_000, healthFactor: 2.4, symbols: ["ETH"] }
    ],
    chains: ["Base", "Ethereum"],
    failedChains: [],
    tokensFetchedAt: now,
    defiFetchedAt: now,
    updatedAt: now,
    partial: false
  };
}

function numaDevApiFallbacks() {
  return {
    name: "numa-dev-api-fallbacks",
    apply: "serve" as const,
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/fx-rates", (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(
          JSON.stringify({
            base: "EUR",
            date: new Date().toISOString().slice(0, 10),
            rates: devFallbackFxRates,
            provider: "dev-fallback"
          })
        );
      });

      server.middlewares.use("/api/market-quotes", (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const requestUrl = new URL(request.url ?? "", "http://127.0.0.1");
        const symbols = (requestUrl.searchParams.get("symbols") ?? "")
          .split(",")
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 20);
        if (symbols.length === 0) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "Provide symbols as a comma-separated query parameter." }));
          return;
        }

        const updatedAt = new Date().toISOString();
        const quotes = Object.fromEntries(
          symbols.map((symbol) => {
            const fallback = devFallbackMarketQuotes[symbol] ?? {
              price: 1,
              changePercent: 0,
              provider: "dev-fallback"
            };
            return [
              symbol,
              {
                symbol,
                price: fallback.price,
                changePercent: fallback.changePercent,
                provider: fallback.provider,
                updatedAt
              }
            ];
          })
        );

        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify({ quotes }));
      });

      // Vite does not execute Vercel functions. Keep wallet-sync failures
      // explicit JSON in local dev (Playwright can intercept this route with
      // a deterministic provider fixture) instead of serving the .ts module.
      server.middlewares.use("/api/crypto-wallet-sync", (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Allow", "POST");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        if (process.env.NUMA_DEV_CRYPTO_FIXTURE === "1") {
          void readDevJsonBody(request).then((body) => {
            const walletIds = Array.isArray(body.walletIds)
              ? body.walletIds.filter((id): id is string => typeof id === "string").slice(0, 8)
              : [];
            if (walletIds.length === 0) {
              response.statusCode = 400;
              response.end(JSON.stringify({ error: "Choose a tracked wallet." }));
              return;
            }
            const now = Date.now();
            response.statusCode = 200;
            response.end(
              JSON.stringify({
                provider: "moralis",
                refreshed: true,
                wallets: walletIds.map((walletId) => ({
                  walletId,
                  snapshot: devCryptoWalletSnapshot(now),
                  cached: false
                }))
              })
            );
          });
          return;
        }
        response.statusCode = 503;
        response.end(JSON.stringify({
          error: "Live wallet sync runs in the Vercel function runtime."
        }));
      });

      // Merchant art is an optional enhancement. In local Vite runs there is
      // no Vercel function runtime, so acknowledge the background request as a
      // no-op instead of letting Vite serve api/merchant-image.ts as a 404.
      server.middlewares.use("/api/merchant-image", (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Allow", "POST");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        response.statusCode = 200;
        response.end(JSON.stringify({ generated: false }));
      });
    }
  };
}

/**
 * Injects <link rel="preconnect"> tags for the Convex deployment into the
 * static HTML so the browser warms DNS + TCP + TLS to the data/auth origins
 * while the app bundle is still downloading. The Convex WebSocket and auth
 * fetches then skip connection setup on cold start.
 */
function numaPreconnectConvex(env: Record<string, string>) {
  return {
    name: "numa-preconnect-convex",
    transformIndexHtml() {
      const tags: HtmlTagDescriptor[] = [];
      const seen = new Set<string>();
      const targets: Array<{ url: string | undefined; crossorigin: boolean }> = [
        // .convex.cloud WebSocket upgrade is a plain (non-CORS) connection.
        { url: env.VITE_CONVEX_URL, crossorigin: false },
        // .convex.site auth/token fetches are CORS requests.
        { url: env.VITE_CONVEX_SITE_URL, crossorigin: true }
      ];
      for (const { url, crossorigin } of targets) {
        if (!url) continue;
        try {
          const origin = new URL(url).origin;
          if (seen.has(origin)) continue;
          seen.add(origin);
          tags.push({
            tag: "link",
            attrs: crossorigin
              ? { rel: "preconnect", href: origin, crossorigin: "" }
              : { rel: "preconnect", href: origin },
            injectTo: "head"
          });
        } catch {
          // Malformed env URL — skip the hint rather than break the build.
        }
      }
      return tags;
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
  plugins: [
    numaDevApiFallbacks(),
    numaPreconnectConvex(env),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // We own the manifest at public/manifest.webmanifest — disable plugin-generated one.
      manifest: false,
      includeAssets: [
        "manifest.webmanifest",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png"
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        // iOS fetches launch screens itself from the <link> tags — precaching
        // 20 device-specific PNGs would cost every visitor ~340 KB for files
        // their device never requests.
        globIgnores: ["**/splash/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "numa-api",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src")
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router") ||
              id.includes("/scheduler/")
            ) {
              return "react-vendor";
            }
            if (id.includes("/framer-motion/")) return "framer";
          }
          return undefined;
        }
      }
    }
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "api/**/*.test.ts",
      "convex/**/*.test.ts",
      "scripts/**/*.test.ts"
    ],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
  };
});
