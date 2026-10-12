import Foundation

enum NumaConfigDev {
  static var current: NumaEnvironmentConfig {
    NumaEnvironmentConfig(
      convexDeploymentURL: "https://rosy-mink-170.eu-west-1.convex.cloud",
      // `vercel dev --listen 3000` uses this repo's .env.local and therefore
      // validates the same rosy-mink bearer token as the Debug Convex client.
      webAppURL: ProcessInfo.processInfo.environment["NUMA_DEV_WEB_APP_URL"]
        ?? "http://127.0.0.1:3000",
      apiConvexDeploymentURL: "https://rosy-mink-170.eu-west-1.convex.cloud"
    )
  }
}
