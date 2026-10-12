const canCreateQaAccount = process.env.NUMA_E2E_CREATE_QA_ACCOUNT === "1";
const productionMutationOk = process.env.NUMA_E2E_PRODUCTION_MUTATION_OK === "1";
const targetUrl =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NUMA_PRODUCTION_URL ||
  "https://numa-ecru.vercel.app";
const targetIsLocal = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(targetUrl);
const targetIsProductionLike = !targetIsLocal;
const missing = ["NUMA_E2E_EMAIL", "NUMA_E2E_PASSWORD"].filter((key) => !process.env[key]);

if (missing.length > 0 && !canCreateQaAccount) {
  console.error(
    [
      `Missing required E2E environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
      "",
      "Run the strict live auth smoke with an existing QA account:",
      'NUMA_E2E_EMAIL="qa@example.com" NUMA_E2E_PASSWORD="..." npm run verify:live:auth',
      "",
      "Or explicitly allow the suite to create a disposable QA account and test records:",
      "NUMA_E2E_CREATE_QA_ACCOUNT=1 NUMA_E2E_PRODUCTION_MUTATION_OK=1 npm run verify:live:auth",
      "",
      "This command intentionally fails instead of silently skipping authenticated production QA."
    ].join("\n")
  );
  process.exit(1);
}

if (missing.length > 0 && canCreateQaAccount && targetIsProductionLike && !productionMutationOk) {
  console.error(
    [
      "Disposable authenticated production QA is a mutating operation.",
      `Target: ${targetUrl}`,
      "",
      "It creates a temporary production account/test records and deletes them at the end.",
      "Re-run only after explicit human approval with:",
      "NUMA_E2E_CREATE_QA_ACCOUNT=1 NUMA_E2E_PRODUCTION_MUTATION_OK=1 npm run verify:live:auth"
    ].join("\n")
  );
  process.exit(1);
}

if (canCreateQaAccount && missing.length > 0) {
  console.warn(
    [
      "NUMA_E2E_CREATE_QA_ACCOUNT=1 is set.",
      targetIsProductionLike
        ? "NUMA_E2E_PRODUCTION_MUTATION_OK=1 is set for a production-like target."
        : "The target looks local/dev.",
      "The authenticated E2E suite may create a disposable QA account and test records."
    ].join("\n")
  );
}
