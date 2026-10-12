import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Camera, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { prepareAvatar } from "@/lib/avatarUpload";
import { useLocale } from "@/lib/i18n";

type PhotoIntent = { kind: "save"; image: ArrayBuffer; receipt: string } | { kind: "remove"; receipt: string };

/** Parent keys this component by account. Every asynchronous intent also binds
 * the exact account on the server; unmounting never retargets a pending save. */
export function AvatarControls({ hasAvatar, userId }: { hasAvatar: boolean; userId: Id<"users"> }) {
  const saveImage = useMutation(api.profileAvatars.setImage);
  const clearImage = useMutation(api.profiles.clearAvatar);
  const { t } = useLocale();
  const input = useRef<HTMLInputElement | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const pending = useRef<PhotoIntent | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); pending.current = null; };
  }, [userId]);

  async function perform(intent: PhotoIntent, controller: AbortController) {
    pending.current = intent;
    try {
      if (intent.kind === "save") await saveImage({ expectedUserId: userId, image: intent.image, clientMutationId: intent.receipt });
      else await clearImage({ expectedUserId: userId, clientMutationId: intent.receipt });
      if (!controller.signal.aborted) pending.current = null;
    } catch {
      if (!controller.signal.aborted) setError("Could not confirm the photo change. Retry safely or choose another photo.");
    }
  }
  async function change(file?: File, retry = false) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || busy.current) return;
    busy.current = true; setUploading(true); setError(null);
    try {
      let intent = retry ? pending.current : null;
      if (!retry) {
        pending.current = null;
        intent = file ? { kind: "save", image: await prepareAvatar(file, controller.signal), receipt: `avatar-${crypto.randomUUID()}` }
          : { kind: "remove", receipt: `avatar-${crypto.randomUUID()}` };
      }
      if (intent && !controller.signal.aborted) await perform(intent, controller);
    } catch {
      if (!controller.signal.aborted) setError("Choose a PNG, JPEG, WebP or GIF photo under 5 MB and 24 megapixels.");
    } finally {
      if (!controller.signal.aborted) { busy.current = false; setUploading(false); }
    }
  }
  return <div className="flex flex-col items-center gap-1">
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" aria-label="Choose profile photo" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (file) void change(file);
    }} />
    <div className="flex items-center gap-2 text-[11px]">
      <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="inline-flex items-center gap-1 font-semibold text-[color:var(--color-brand-strong)] hover:underline disabled:opacity-60">
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        {uploading ? t("settings.uploading") : t("settings.changePhoto")}
      </button>
      {hasAvatar && <button type="button" disabled={uploading} onClick={() => void change()} className="text-[color:var(--color-ink-4)] hover:underline disabled:opacity-60">{t("settings.removePhoto")}</button>}
    </div>
    <p className="max-w-[240px] text-center text-[11px] text-[color:var(--color-ink-3)]">Only a small profile thumbnail is saved, not the original photo or its metadata.</p>
    {error && <p role="alert" className="max-w-[240px] text-center text-[11px] text-[color:var(--color-negative)]">{error}</p>}
    {error && pending.current && <button type="button" disabled={uploading} onClick={() => void change(undefined, true)} className="text-[11px] underline">Retry photo change</button>}
  </div>;
}
