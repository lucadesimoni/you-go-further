import { useEffect, useRef, useState } from "react";
import { resolveConfirm, subscribeConfirm, type ConfirmState } from "../ui/confirm";
import { useFocusTrap } from "../ui/useFocusTrap";
import { useT } from "../i18n";

/** Renders the promise-based confirm dialog. Mount once near the app root. */
export function ConfirmHost() {
  const t = useT();
  const [state, setState] = useState<ConfirmState>({ open: false, opts: { title: "" } });
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, state.open);
  useEffect(() => subscribeConfirm(setState), []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveConfirm(false);
      if (e.key === "Enter") resolveConfirm(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.open]);

  if (!state.open) return null;
  const { title, message, confirmLabel, cancelLabel, danger } = state.opts;

  return (
    <div className="modal-backdrop" onClick={() => resolveConfirm(false)}>
      <div
        ref={dialogRef}
        className="modal panel confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="confirm-title" id="confirm-title">{title}</h3>
        {message && <p className="detail">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => resolveConfirm(false)}>
            {cancelLabel ?? t("common.cancel")}
          </button>
          {/*
            No `autoFocus` here, for two reasons. React applies it during mount,
            before the focus trap's effect runs — so the trap recorded *this*
            button as "what was focused before the dialog opened", and on close
            restored focus to an element that no longer existed, dropping the
            keyboard user back at the top of the page. And on a dialog that
            asks before deleting an account, the safe button is the one that
            should be under a stray Enter; the trap focuses Cancel first, and
            Enter still confirms through the key handler above for anyone who
            means it.
          */}
          <button
            type="button"
            className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`}
            onClick={() => resolveConfirm(true)}
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
