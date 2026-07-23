/**
 * Promise-based confirmation dialog, same singleton pattern as the toasts. Call
 * `await confirm({ ... })` from anywhere; a single <ConfirmHost/> renders the
 * dialog and resolves the promise with the user's choice.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
}

export interface ConfirmState {
  open: boolean;
  opts: ConfirmOptions;
  resolve?: (v: boolean) => void;
}

let state: ConfirmState = { open: false, opts: { title: "" } };
const listeners = new Set<(s: ConfirmState) => void>();
const emit = () => listeners.forEach((l) => l(state));

export function subscribeConfirm(l: (s: ConfirmState) => void): () => void {
  listeners.add(l);
  l(state);
  return () => void listeners.delete(l);
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    state = { open: true, opts, resolve };
    emit();
  });
}

export function resolveConfirm(value: boolean): void {
  state.resolve?.(value);
  state = { open: false, opts: { title: "" } };
  emit();
}
