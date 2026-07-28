import type { NextAction } from "../progress";
import type { TranslationKey, Vars } from "./index";

/**
 * Translate an engine-produced next action.
 *
 * The engine stays framework- and language-free: it emits a stable `id` plus
 * English text. The UI maps the id to a key here, so every screen shows the same
 * wording and an unknown id still renders the engine's own English rather than a
 * blank.
 */
export function actionText(
  action: NextAction,
  t: (key: TranslationKey, vars?: Vars) => string,
): { title: string; why: string } {
  const titleKey = `action.${action.id}` as TranslationKey;
  const whyKey = `action.${action.id}.why` as TranslationKey;
  const title = t(titleKey, action.vars);
  const why = t(whyKey);
  return {
    // t() returns the key itself when it is missing — fall back to the engine.
    title: title === titleKey ? action.title : title,
    why: why === whyKey ? action.why : why,
  };
}
