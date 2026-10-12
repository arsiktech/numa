import { useEffect, useId, useRef, useState } from "react";
import { ShieldCheck, WalletCards } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import {
  MAX_TRACKED_CRYPTO_WALLETS,
  cryptoWalletFreeTextProblem,
  cryptoWalletInputProblem,
  normalizeCryptoWalletAddress,
  shortCryptoAddress
} from "@/lib/cryptoWallets";
import type { CryptoWallet } from "@/lib/types";
import { useDomainActions } from "@/services/domainActions";

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/message["']?\s*:\s*["']([^"']+)/i);
  return match?.[1] ?? message.replace(/^.*?Uncaught Error:\s*/i, "");
}

export function CryptoWalletDialog({
  open,
  portfolioId,
  wallets,
  onClose,
  onTracked
}: {
  open: boolean;
  portfolioId: string;
  wallets: CryptoWallet[];
  onClose: () => void;
  onTracked: (walletId: string) => void | Promise<void>;
}) {
  const actions = useDomainActions();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wasOpen = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (open && !wasOpen.current) {
      setAddress("");
      setLabel(wallets.length === 0 ? "Main wallet" : `Wallet ${wallets.length + 1}`);
      setIncludeInNetWorth(true);
      setError(null);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, wallets.length]);

  async function submit() {
    const problem = cryptoWalletInputProblem(address);
    if (problem === "empty") {
      setError("Paste a public wallet address.");
      return;
    }
    if (problem === "suspected-secret") {
      setError("This looks like a recovery phrase or private key. Nothing was sent or saved.");
      return;
    }
    const normalized = normalizeCryptoWalletAddress(address);
    if (!normalized) {
      setError("Enter a public EVM, Solana, or Bitcoin bc1 mainnet address.");
      return;
    }
    if (cryptoWalletFreeTextProblem(label) === "suspected-secret") {
      setError("The wallet label looks like a recovery phrase or private key. Nothing was sent or saved.");
      return;
    }
    const duplicate = wallets.find((wallet) => wallet.address === normalized.address);
    if (duplicate) {
      setError(`Already tracked as ${duplicate.label} (${shortCryptoAddress(duplicate.address)}).`);
      return;
    }
    if (wallets.length >= MAX_TRACKED_CRYPTO_WALLETS) {
      setError(`You can track up to ${MAX_TRACKED_CRYPTO_WALLETS} wallets in one portfolio.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await actions.createCryptoWallet({
        portfolioId,
        address: normalized.address,
        label: label.trim() || `Wallet ${wallets.length + 1}`,
        includeInNetWorth
      });
      await onTracked(result.id);
      onClose();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Track a public wallet"
      description="Numa Pro reads public blockchain data. It cannot sign or move funds."
      width={560}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-[color:var(--color-ink)] p-4 text-[color:var(--color-bg)]">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]">
              <WalletCards size={18} />
            </span>
            <div>
              <p className="text-[13px] font-semibold">Public address only</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[color:color-mix(in_oklab,var(--color-bg)_72%,transparent)]">
                Never paste a seed phrase, recovery phrase, or private key. Numa Pro never needs one.
              </p>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-[12px] font-semibold text-[color:var(--color-ink-2)]">
            Wallet address
          </span>
          <input
            autoFocus
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="0x… · Solana public key · bc1…"
            className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 font-mono text-[16px] text-[color:var(--color-ink)] outline-none transition-colors placeholder:text-[color:var(--color-ink-4)] focus:border-[color:var(--color-brand)]"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold text-[color:var(--color-ink-2)]">
            Wallet label
          </span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={48}
            placeholder="Main wallet"
            className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 text-[16px] text-[color:var(--color-ink)] outline-none transition-colors placeholder:text-[color:var(--color-ink-4)] focus:border-[color:var(--color-brand)]"
          />
        </label>

        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-4 py-3">
          <span>
            <span className="block text-[13px] font-semibold text-[color:var(--color-ink)]">
              Include in Capital total
            </span>
            <span className="mt-0.5 block text-[11.5px] text-[color:var(--color-ink-3)]">
              Turn this off if the same crypto is already entered manually.
            </span>
          </span>
          <input
            type="checkbox"
            checked={includeInNetWorth}
            onChange={(event) => setIncludeInNetWorth(event.target.checked)}
            className="h-5 w-5 accent-[color:var(--color-brand)]"
          />
        </label>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="rounded-xl bg-[color:var(--color-blush-100)] px-3 py-2 text-[12.5px] text-[color:var(--color-negative)]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--color-bg)] px-3.5 py-3 text-[12px] text-[color:var(--color-ink-3)]">
          <ShieldCheck size={15} className="shrink-0 text-[color:var(--color-positive)]" />
          <span>Supported: EVM networks, Solana, and Bitcoin bc1 mainnet addresses. Values are estimates in USD.</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="nm-interactive h-12 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[13.5px] font-semibold text-[color:var(--color-ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="nm-interactive h-12 rounded-2xl bg-[color:var(--color-cta)] text-[13.5px] font-semibold text-[color:var(--color-cta-ink)] disabled:opacity-50"
          >
            {saving ? "Tracking…" : "Track wallet"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
