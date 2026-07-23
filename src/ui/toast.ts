/**
 * Tiny framework-light toast store. A module singleton with a subscribe/emit
 * API so any component can raise a toast (`toast.success("Saved")`) and a single
 * <ToastHost/> renders them. No context wiring, no dependencies.
 */
export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(toasts));

export function subscribeToasts(l: (t: Toast[]) => void): () => void {
  listeners.add(l);
  l(toasts);
  return () => void listeners.delete(l);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(kind: ToastKind, message: string, ttlMs = 3800): void {
  const id = ++seq;
  toasts = [...toasts, { id, kind, message }];
  emit();
  if (typeof setTimeout !== "undefined") setTimeout(() => dismissToast(id), ttlMs);
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m, 5000),
  info: (m: string) => push("info", m),
};
