import { MerchantStillLife, type StillLifeKind } from "./stillLife";
import { ImageReveal } from "./ImageReveal";

/**
 * The entry visual: the hand-drawn still-life renders INSTANTLY (zero network,
 * consistent art direction), and when a cached AI studio shot exists for this
 * merchant it develops in on top via the WebGL reveal. Same pedestal, same
 * framing — an upgrade, never a swap.
 */
export function MerchantVisual({
  kind,
  merchant,
  imageUrl,
  className
}: {
  kind: StillLifeKind;
  merchant: string;
  imageUrl?: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div className={className}>
        <ImageReveal src={imageUrl} alt={merchant} className="h-full w-full object-contain" />
      </div>
    );
  }
  return <MerchantStillLife kind={kind} seedKey={merchant} className={className} />;
}
