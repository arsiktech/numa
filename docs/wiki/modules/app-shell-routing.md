# Module: App Shell And Routing

This module starts the SPA, installs global recovery hooks, and routes users through auth, onboarding, app-mode gates, lazy pages, and the authenticated shell.

## Responsibilities

- Apply theme, palette, app mode, fonts, error reporting, asset reload recovery, and install prompt state before React mounts.
- Compose `AuthProvider`, `RouterProvider`, `CloudDataProvider`, `StoreProvider`, and `WriteQueueProvider`.
- Keep `/welcome` as the real pre-auth route and redirect legacy `/login` and `/signup`.
- Route shared mode home to `/pod`, block personal routes in shared mode, and block advanced routes from light/shared mode.
- Render global navigation, banners, floating add/search/voice/scan cluster, proximity docks, import/export, and onboarding tour.

## Key Files

- [`src/main.tsx`](../../../src/main.tsx) - application boot and pre-React visual setup.
- [`src/App.tsx`](../../../src/App.tsx) - route tree, lazy-route recovery, protected root, onboarding and mode gates.
- [`src/routes/layout.tsx`](../../../src/routes/layout.tsx) - authenticated app shell and global UI affordances.
- [`src/components/layout/navItems.ts`](../../../src/components/layout/navItems.ts) - mode-aware navigation definitions.
- [`src/lib/assetReload.ts`](../../../src/lib/assetReload.ts) - recoverable lazy chunk reload behavior.
- [`src/lib/appMode.ts`](../../../src/lib/appMode.ts), [`src/lib/theme.ts`](../../../src/lib/theme.ts), [`src/lib/themeKey.ts`](../../../src/lib/themeKey.ts) - persisted UI/runtime mode state.

## Public API

- `router` from `src/App.tsx`.
- `AppLayout()` from `src/routes/layout.tsx`.
- `useAppMode()`, `applyAppMode()`, `getStoredAppMode()` from `src/lib/appMode.ts`.

## Internal Structure

`main.tsx` is intentionally thin and global. `App.tsx` owns route definitions and guards. `layout.tsx` owns shell chrome and global lazy dialogs, while page modules own route content.

## Dependencies

- Uses React Router, Framer Motion, Convex Auth provider, the store/cloud/write-queue providers, and layout primitives.
- Used by every product surface.

## Notable Patterns / Gotchas

- Lazy route failures that look like stale chunks should trigger controlled reload recovery, not an infinite loader or route error boundary.
- `RequireOnboarding` intentionally lets returning `cloud-loading` users render the app while Convex hydrates if there is no fresh onboarding marker.
- Shared mode deep links to `/money` or `/buckets` redirect to `/`.
