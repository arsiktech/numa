import Foundation

struct NumaEnvironmentConfig {
  let convexDeploymentURL: String
  let webAppURL: String
  /// Convex identity used by the Vercel API host to verify native bearer
  /// tokens. Keep this equal to `convexDeploymentURL`; the separate field
  /// makes a cross-environment pairing impossible to hide in configuration.
  let apiConvexDeploymentURL: String
}

enum NumaConfig {
  #if NUMA_PROD
  static let current = NumaConfigProd.current
  #elseif DEBUG
  static let current = NumaConfigDev.current
  #else
  static let current = NumaConfigProd.current
  #endif
}
