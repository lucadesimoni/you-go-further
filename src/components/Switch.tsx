import { useId } from "react";

/**
 * A switch — for settings that take effect the moment they are flipped.
 *
 * The distinction against a checkbox is not cosmetic: a checkbox states an
 * intention that a Save button later commits, while a switch *is* the action.
 * Every use here writes immediately (platform settings patch the server, profile
 * preferences persist on change), so the control should look like a state, not
 * like a form field waiting to be submitted.
 *
 * It is a real `<input type="checkbox" role="switch">` rather than a styled
 * `<button>`: that keeps the label association, keyboard behaviour (Space) and
 * screen-reader announcement ("on"/"off") that browsers already give for free.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  /** Layout: the row fills its container and pushes the switch to the end. */
  block = true,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  block?: boolean;
}) {
  const id = useId();
  return (
    <label className={`switch-row${block ? " switch-block" : ""}${disabled ? " switch-disabled" : ""}`} htmlFor={id}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {hint && <span className="switch-hint">{hint}</span>}
      </span>
      <input
        id={id}
        className="switch-input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
    </label>
  );
}
