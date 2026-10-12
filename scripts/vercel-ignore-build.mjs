import { spawnSync } from "node:child_process";

if (process.env.CONVEX_DEPLOY_KEY?.trim()) {
  console.log("CONVEX_DEPLOY_KEY is present; continue build for Convex cutover.");
  process.exit(1);
}

const diff = spawnSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {
  encoding: "utf8",
});

if (diff.status !== 0) {
  console.log("Could not inspect changed files; continue build.");
  process.exit(1);
}

const changedFiles = diff.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const deployRelevantPatterns = [
  /^api\//,
  /^convex\//,
  /^public\//,
  /^src\//,
  /^scripts\/vercel-(build|ignore-build)\.mjs$/,
  /^index\.html$/,
  /^package(-lock)?\.json$/,
  /^tsconfig.*\.json$/,
  /^vite\.config\./,
  /^vercel\.json$/,
];

const hasDeployRelevantChange = changedFiles.some((file) =>
  deployRelevantPatterns.some((pattern) => pattern.test(file)),
);

if (hasDeployRelevantChange) {
  console.log("Deployment-relevant files changed; continue build.");
  process.exit(1);
}

console.log("Only non-deployment files changed; skip Vercel build.");
process.exit(0);
