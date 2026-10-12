/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_CONVEX_SITE_URL?: string;
  readonly VITE_NUMA_CLOUD_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
