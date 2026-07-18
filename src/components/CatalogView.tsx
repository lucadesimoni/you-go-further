import { useMemo, useState } from "react";
import { CATALOG } from "../engine";
import type { ProductCategory } from "../engine";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  "drink-mix": "Drink mix",
  gel: "Gel",
  bar: "Bar",
  electrolyte: "Electrolyte",
  recovery: "Recovery",
};

/** Swiss product catalog browser. Editing is gated to `catalog:edit`. */
export function CatalogView({ canEdit }: { canEdit: boolean }) {
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const categories = useMemo(() => [...new Set(CATALOG.map((p) => p.category))], []);
  const items = CATALOG.filter((p) => category === "all" || p.category === category);

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>Swiss product catalog</h2>
          <span className="pill">{CATALOG.length} products</span>
        </div>
        <p className="detail">
          Sponser and Winforce products that drive recommendations.{" "}
          {canEdit
            ? "As a nutritionist/admin you can tune these values (persisted via the catalog API in production)."
            : "Read-only — a nutritionist or admin can tune these values."}
        </p>

        <div className="segmented" style={{ gridTemplateColumns: `repeat(${categories.length + 1}, 1fr)`, marginBottom: 14 }}>
          <button type="button" className={category === "all" ? "seg active" : "seg"} onClick={() => setCategory("all")}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className={category === c ? "seg active" : "seg"} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="providers">
          {items.map((p) => (
            <div key={p.id} className="provider-card">
              <div className="provider-top">
                <span className="provider-name">
                  <strong>{p.brand}</strong> {p.name}
                </span>
                <span className="serving">{CATEGORY_LABELS[p.category]}</span>
              </div>
              <div className="tags">
                {p.carbsG > 1 && <span className="tag">{p.carbsG} g carb</span>}
                {p.sodiumMg > 0 && <span className="tag">{p.sodiumMg} mg Na</span>}
                {p.proteinG ? <span className="tag">{p.proteinG} g protein</span> : null}
                {p.caffeineMg ? <span className="tag caf">{p.caffeineMg} mg caffeine</span> : null}
                {p.multiTransportable && <span className="tag">2:1 carbs</span>}
                {p.phases.map((ph) => (
                  <span key={ph} className="tag">
                    {ph}
                  </span>
                ))}
              </div>
              <p className="provider-note">{p.servingLabel}</p>
              {canEdit && (
                <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} disabled title="Wired to the catalog API in production">
                  Edit values
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
