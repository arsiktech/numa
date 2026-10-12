import { spawnSync } from "node:child_process";

const DEV_CONVEX_URL = "https://rosy-mink-170.eu-west-1.convex.cloud";
const DEV_CONVEX_SITE_URL = "https://rosy-mink-170.eu-west-1.convex.site";

const hasConvexDeployKey = Boolean(process.env.CONVEX_DEPLOY_KEY?.trim());
const isVercelPreview = process.env.VERCEL_ENV === "preview";

function previewEnv() {
  return {
    ...process.env,
    VITE_NUMA_CLOUD_AUTH: process.env.VITE_NUMA_CLOUD_AUTH?.trim() || "1",
    VITE_CONVEX_URL: process.env.VITE_CONVEX_URL?.trim() || DEV_CONVEX_URL,
    VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL?.trim() || DEV_CONVEX_SITE_URL
  };
}

const command = hasConvexDeployKey
  ? {
      executable: "npx",
      args: [
        "convex",
        "deploy",
        "--yes",
        "--cmd",
        "npm run build",
        "--cmd-url-env-var-name",
        "VITE_CONVEX_URL"
      ],
      label: "Convex production deploy + Vite build",
      env: process.env
    }
  : isVercelPreview
    ? {
        executable: "npm",
        args: ["run", "build"],
        label: "Vite preview build (dev Convex fallback)",
        env: previewEnv()
      }
  : {
      executable: "npm",
      args: ["run", "build"],
      label: "Vite build (no Convex key — running local-only)",
      env: {
        ...process.env,
        VITE_CONVEX_URL: ""
      }
    };

console.log(`Running ${command.label}...`);

const result = spawnSync(command.executable, command.args, {
  stdio: "inherit",
  env: command.env
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
  const assertResult = spawnSync("node", ["scripts/assert-build-cloud-config.mjs"], {
    stdio: "inherit"
  });
  if (assertResult.error) {
    console.error(assertResult.error.message);
    process.exit(1);
  }
  process.exit(assertResult.status ?? 1);
}

process.exit(0);
