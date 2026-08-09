import { useMemo } from "react";
import { idealOffering, type FuellingTarget, type AthleteInput, type Product } from "../engine";
import { useT } from "../i18n";

/**
 * Slot-by-slot view of the "ideal offering" algorithm: for each functional slot
 * the plan needs, show the chosen product with its 0–100 fit score, the reasons
 * it was picked, and the next-best alternatives. Collapsed by default so the plan
 * stays clean — it's the "show your working" layer for anyone who wants it.
 */
export function OfferingPanel({
  input,
  target,
  catalog,
}: {
  input: AthleteInput;
  target: FuellingTarget;
  catalog: Product[];
}) {
  const t = useT();
  const offering = useMemo(() => idealOffering(input, target, catalog), [input, target, catalog]);
  const active = offering.slots.filter((s) => s.needed && s.pick);

  if (active.length === 0) return null;

  return (
    <details className="panel offering">
      <summary className="offering-summary">
        <span>{t("offering.title")}</span>
        <span className="offering-hint">{t("offering.hint", { count: active.length })}</span>
      </summary>

      <p className="offering-headline">{offering.headline}</p>

      <div className="offering-slots">
        {active.map((s) => (
          <div key={s.slot} className="offering-slot">
            <div className="offering-slot-head">
              <span className="offering-slot-label">{s.label}</span>
              {s.pick && <span className="score-badge">{s.pick.score}</span>}
            </div>
            <p className="offering-guidance">{s.guidance}</p>

            {s.pick && (
              <div className="offering-pick">
                <div className="product-top">
                  <span className="product-name">
                    <strong>{s.pick.product.brand}</strong> {s.pick.product.name}
                    {s.pick.product.custom && <span className="tag tag-house">house</span>}
                  </span>
                  <span className="serving">{s.pick.product.servingLabel}</span>
                </div>
                <ul className="offering-reasons">
                  {s.pick.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {s.alternatives.length > 0 && (
              <div className="offering-alts">
                <span className="offering-alts-label">{t("offering.alsoConsidered")}</span>
                {s.alternatives.map((a) => (
                  <span key={a.product.id} className="offering-alt">
                    {a.product.brand} {a.product.name}
                    <span className="offering-alt-score">{a.score}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
