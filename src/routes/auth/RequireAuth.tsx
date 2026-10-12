import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/services/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { currentAccount } = useAuth();
  const location = useLocation();
  if (!currentAccount) {
    // Pre-auth users hit the new Welcome screen (lime orb + Apple/Google).
    // Password-based / "I already have an account" flows still live at /login.
    return (
      <Navigate
        to="/welcome"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}
