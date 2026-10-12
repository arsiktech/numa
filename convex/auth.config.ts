import type { AuthConfig } from "convex/server";

const providers: AuthConfig["providers"] = [
  {
    domain: process.env.CONVEX_SITE_URL!,
    applicationID: "convex"
  }
];

export default {
  providers
} satisfies AuthConfig;
