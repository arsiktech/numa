import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dedicated local server. These service substitutions never enter the product
// build or its auth routes. The fixture has no cloud client or API handlers.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  configFile: false,
  // Two Vite servers must not overwrite each other's optimized dependencies.
  cacheDir: path.join(root, "node_modules/.vite-experience"),
  root: path.join(root, "tests/fixtures/experience"),
  plugins: [react(), tailwind()],
  resolve: { alias: [
    ...["store", "domainActions", "writeQueue", "podActions"].map(service => ({
      find: `@/services/${service}`, replacement: path.join(root, "tests/fixtures/experience/boundaries.ts")
    })),
    { find: "@/lib/appMode", replacement: path.join(root, "tests/fixtures/experience/boundaries.ts") },
    { find: "@", replacement: path.join(root, "src") }
  ] },
  server: { host: "127.0.0.1", port: 5174, strictPort: true, fs: { allow: [root] } }
});
await server.listen();
server.printUrls();
