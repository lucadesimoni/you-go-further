import { useEffect, useState } from "react";
import { resolveConfirm, subscribeConfirm, type ConfirmState } from "../ui/confirm";

/** Renders the promise-based confirm dialog. Mount once near the app root. */
export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState>({ open: false, opts: { title: "" } });
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
      <div className="modal panel confirm" role="alertdialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="detail">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => resolveConfirm(false)}>
            {cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`}
            onClick={() => resolveConfirm(true)}
            autoFocus
          >
            {confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
