import { useCallback, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./Button";

/**
 * Two-step destructive action: the first press arms ("Tap again to confirm"),
 * the second press within 4s fires. Re-arms are safe and idempotent.
 * Previously every delete-capable dialog reimplemented this with its own
 * timeout state.
 */
export function useConfirmDelete() {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timerRef = useRef<number | null>(null);

  const arm = useCallback(() => {
    setConfirmDelete(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setConfirmDelete(false), 4000);
  }, []);

  const disarm = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setConfirmDelete(false);
  }, []);

  return { confirmDelete, arm, disarm };
}

interface DialogFooterProps {
  /** Delete button only renders when true (defaults to onDelete being given). */
  canDelete?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  confirmDelete?: boolean;
  onClose: () => void;
  submitLabel: string;
  submitIcon?: ReactNode;
  busy?: boolean;
}

/** The shared Cancel / Delete / Save footer used by every record dialog. */
export function DialogFooter({
  canDelete,
  onDelete,
  deleteLabel = "Delete",
  confirmDelete = false,
  onClose,
  submitLabel,
  submitIcon,
  busy
}: DialogFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
      {(canDelete ?? Boolean(onDelete)) && onDelete ? (
        <Button type="button" variant="danger" onClick={onDelete}>
          <Trash2 size={14} />
          {confirmDelete ? "Tap again to confirm" : deleteLabel}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {submitIcon}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
