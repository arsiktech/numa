import { NumaCoinLogo } from "./NumaCoinLogo";

/** The same coin and wordmark on product, public, and legal surfaces. */
export function BrandLockup({ size = 40 }: { size?: number }) {
  return (
    <span className="nm-brand-lockup">
      <NumaCoinLogo size={size} />
      <span>Numa <span className="nm-brand-pro">Pro</span></span>
    </span>
  );
}

/** Decorative geometry, deliberately independent of financial charts and values. */
export function BrandOrbit({ className = "" }: { className?: string }) {
  return (
    <svg className={`nm-brand-orbit ${className}`} viewBox="0 0 400 400" fill="none" aria-hidden="true" focusable="false">
      <circle cx="200" cy="200" r="156" />
      <ellipse cx="200" cy="200" rx="156" ry="66" transform="rotate(-35 200 200)" />
      <ellipse cx="200" cy="200" rx="156" ry="66" transform="rotate(55 200 200)" />
      <circle className="nm-brand-orbit-dot" cx="328" cy="111" r="12" />
      <circle className="nm-brand-orbit-dot" cx="72" cy="289" r="5" />
    </svg>
  );
}
