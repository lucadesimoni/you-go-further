import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type Toast } from "../ui/toast";

/** Renders the toast stack. Mount once near the app root. */
export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  if (items.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <button key={t.id} type="button" className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
          <span className="toast-mark" aria-hidden>
            {t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}
          </span>
          {t.message}
        </button>
      ))}
    </div>
  );
}
