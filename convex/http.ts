import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { mcp } from "./agentMcp";
import { receive as receiveAppleNotification } from "./appleNotifications";

const http = httpRouter();

auth.addHttpRoutes(http);

// Registration with Apple and the resulting deletion policy require release approval.
http.route({ path: "/apple/notifications", method: "POST", handler: receiveAppleNotification });

// Connected AI agents (MCP). /mcp takes the secret as a bearer token; /mcp/<secret> carries it in the link.
for (const method of ["POST", "GET", "DELETE", "OPTIONS"] as const) {
  http.route({ path: "/mcp", method, handler: mcp });
  http.route({ pathPrefix: "/mcp/", method, handler: mcp });
}

export default http;
