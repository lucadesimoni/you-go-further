import { useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Picking one thing from a short list.
 *
 * Most of these choices used a native `<select>`, and a native select is the
 * worst control we could have reached for here. It hides every option but the
 * chosen one, so the athlete cannot see that "Hot" exists without opening a
 * menu; it truncates anything long, so "Endurance performance — Go longer and
 * faster" arrived as "Endurance performance — Go longer a…"; and on a phone it
 * hands the whole screen to an OS wheel that has nothing to do with this app.
 *
 * Three or four short options are a row of buttons. Five options with a
 * sentence of explanation each are cards. Both are visible at a glance, both
 * are one tap, and neither ever truncates.
 *
 * Keyboard behaviour follows the radio-group pattern rather than the button-row
 * one: Tab moves to the group, arrows move within it. That is what a screen
 * reader announces ("Hot, radio button, 3 of 3") and what a keyboard user
 * expects from a single choice.
 */

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** One line of "what this means", shown on cards. */
  blurb?: string;
  icon?: IconName;
  /** A short trailing fact — a date, a distance. Cards only. */
  meta?: string;
  disabled?: boolean;
}

interface BaseProps<T extends string> {
  /** The group's own name. Rendered above it unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  /**
   * The current choice. Undefined and unknown values are both legitimate: an
   * optional field may not be set yet, and the race picker starts on nothing.
   * Either way no option shows as chosen, which is the honest rendering.
   */
  value: T | undefined;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** Shown next to the label, e.g. the current value in prose. */
  aside?: ReactNode;
}

/** Move the selection with the arrow keys, wrapping at both ends. */
function useArrowKeys<T extends string>(options: ChoiceOption<T>[], value: T | undefined, onChange: (v: T) => void) {
  const groupRef = useRef<HTMLDivElement>(null);

  return {
    groupRef,
    /**
     * Which option carries the group's single tab stop. With nothing chosen
     * yet it falls to the first usable option — otherwise a group with no
     * selection would have no way in from the keyboard at all.
     */
    focusValue: options.some((o) => o.value === value && !o.disabled)
      ? value
      : options.find((o) => !o.disabled)?.value,
    onKeyDown: (e: React.KeyboardEvent) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();
      const usable = options.filter((o) => !o.disabled);
      if (usable.length === 0) return;
      const at = usable.findIndex((o) => o.value === value);
      const next =
        at < 0
          ? usable[step > 0 ? 0 : usable.length - 1]
          : usable[(at + step + usable.length) % usable.length];
      onChange(next.value);
      // Follow the selection with focus, the way a real radio group does.
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']");
      buttons?.forEach((b) => b.dataset.value === next.value && b.focus());
    },
  };
}

/**
 * A row of chips — for two to five options whose labels are a word or two.
 *
 * They flow rather than sharing equal columns. Equal columns are tidier when
 * every label is short in every language, and this app has four: "Easy /
 * Moderate / Hard / Race" fits four columns and "Locker / Mittel / Hart /
 * Wettkampf" does not, so the German planner was cutting its own last option
 * in half. Content-sized chips cannot do that.
 */
export function ChoiceRow<T extends string>({ label, hideLabel, value, options, onChange, aside }: BaseProps<T>) {
  const { groupRef, focusValue, onKeyDown } = useArrowKeys(options, value, onChange);
  return (
    <div className="field choice-field">
      {!hideLabel && (
        <span className="group-label">
          {label}
          {aside && <span className="value">{aside}</span>}
        </span>
      )}
      <div
        ref={groupRef}
        className="choice-row"
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-value={o.value}
              tabIndex={o.value === focusValue ? 0 : -1}
              disabled={o.disabled}
              className={on ? "seg active" : "seg"}
              onClick={() => onChange(o.value)}
            >
              {o.icon && <Icon name={o.icon} />}
              <span className="seg-label">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A stack of cards — for options that need a sentence to tell them apart.
 *
 * The blurb is the whole point. "Race preparation" and "Endurance performance"
 * are not self-explanatory to someone deciding between them for the first time,
 * and the explanation we had written for exactly that moment was being cut off
 * by the control it lived in.
 */
export function ChoiceCards<T extends string>({ label, hideLabel, value, options, onChange, aside }: BaseProps<T>) {
  const { groupRef, focusValue, onKeyDown } = useArrowKeys(options, value, onChange);
  return (
    <div className="field choice-field">
      {!hideLabel && (
        <span className="group-label">
          {label}
          {aside && <span className="value">{aside}</span>}
        </span>
      )}
      <div ref={groupRef} className="choice-cards" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-value={o.value}
              tabIndex={o.value === focusValue ? 0 : -1}
              disabled={o.disabled}
              className={on ? "choice-card on" : "choice-card"}
              onClick={() => onChange(o.value)}
            >
              {o.icon && (
                <span className="choice-card-icon" aria-hidden>
                  <Icon name={o.icon} />
                </span>
              )}
              <span className="choice-card-text">
                <span className="choice-card-label">{o.label}</span>
                {o.blurb && <span className="choice-card-blurb">{o.blurb}</span>}
              </span>
              {o.meta && <span className="choice-card-meta">{o.meta}</span>}
              <span className="choice-tick" aria-hidden>
                {on ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
