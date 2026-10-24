import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { mcp } from "./agentMcp";
import { receive as receiveAppleNotification } from "./appleNotifications";
import { googleCallback, start as startGoogleLink } from "./googleLink";

const http = httpRouter();

auth.addHttpRoutes(http);

// "Add Google" to a signed-in account (see googleLink.ts). Google returns to Convex Auth's
// registered callback; this exact-path route takes only link states and hands every other
// callback to Convex Auth's own handler, found on a private router so nothing is copied.
const authRoutes = httpRouter();
auth.addHttpRoutes(authRoutes);
const authGoogleCallback = authRoutes.lookup("/api/auth/callback/google", "GET");
// Without any OAuth provider configured, Convex Auth registers no callback and there is no Google to add.
if (authGoogleCallback) {
  http.route({ path: "/api/auth/callback/google", method: "GET", handler: googleCallback(authGoogleCallback[0]) });
  http.route({ path: "/link/google/start", method: "GET", handler: startGoogleLink });
}

// Registration with Apple and the resulting deletion policy require release approval.
http.route({ path: "/apple/notifications", method: "POST", handler: receiveAppleNotification });

// Connected AI agents (MCP). /mcp takes the secret as a bearer token; /mcp/<secret> carries it in the link.
for (const method of ["POST", "GET", "DELETE", "OPTIONS"] as const) {
  http.route({ path: "/mcp", method, handler: mcp });
  http.route({ pathPrefix: "/mcp/", method, handler: mcp });
}

export default http;
