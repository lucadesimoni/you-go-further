import { useEffect, useMemo, useState } from "react";
import { CATALOG, productUsage, type Phase, type Product, type ProductCategory } from "../engine";
import type { Role } from "../auth";
import { catalogPersistence, deleteProduct, loadCatalog, saveProduct } from "../api/productLibrary";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  "drink-mix": "Drink mix",
  gel: "Gel",
  bar: "Bar",
  electrolyte: "Electrolyte",
  recovery: "Recovery",
};
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[];
const ALL_PHASES: Phase[] = ["pre", "during", "post"];

type Draft = Partial<Product>;
const EMPTY: Draft = { category: "drink-mix", phases: ["during"], swiss: true, carbsG: 0, sodiumMg: 0 };

/**
 * Swiss product library. Everyone browses the merged catalog (built-in brands +
 * house products); `catalog:edit` (nutritionist / admin / owner) unlocks a full
 * editor to add own products, override a built-in's values, and manage shop links.
 */
export function CatalogView({ canEdit, role = "athlete" }: { canEdit: boolean; role?: Role }) {
  const [catalog, setCatalog] = useState<Product[]>(CATALOG);
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((list) => !cancelled && list.length && setCatalog(list))
      .catch(() => {
        /* keep built-in on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => [...new Set(catalog.map((p) => p.category))], [catalog]);
  const items = catalog.filter((p) => category === "all" || p.category === category);
  const customCount = catalog.filter((p) => p.custom).length;
  const brands = useMemo(() => [...new Set(catalog.map((p) => p.brand))].sort(), [catalog]);

  const set = <K extends keyof Product>(key: K, value: Product[K]) => setDraft((d) => ({ ...(d ?? {}), [key]: value }));
  const togglePhase = (ph: Phase) =>
    setDraft((d) => {
      const cur = new Set(d?.phases ?? []);
      cur.has(ph) ? cur.delete(ph) : cur.add(ph);
      return { ...(d ?? {}), phases: [...cur] };
    });

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      setCatalog(await saveProduct(role, draft));
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save product");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setCatalog(await deleteProduct(role, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>Swiss product library</h2>
          <span className="pill">{catalog.length} products</span>
        </div>
        <p className="detail">
          {brands.join(" · ")} — the Swiss-only library that drives every recommendation. Each product
          has a <strong>when-to-use</strong> guide (tap a card).{" "}
          {canEdit ? (
            <>
              You can add your own products, override a built-in's values, and set shop links.{" "}
              <strong>{customCount}</strong> house product{customCount === 1 ? "" : "s"} ·{" "}
              {catalogPersistence.mode() === "server" ? "saved on the server" : "saved in this browser"}.
            </>
          ) : (
            "Read-only — a nutritionist or admin curates this library."
          )}
        </p>

        {canEdit && (
          <div className="catalog-actions">
            <button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })} disabled={busy}>
              + Add product
            </button>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}

        <div
          className="segmented"
          style={{ gridTemplateColumns: `repeat(${categories.length + 1}, 1fr)`, marginBottom: 14 }}
        >
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
                  {p.custom && <span className="tag tag-house">house</span>}
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
              <p className="provider-note">
                {p.servingLabel}
                {p.priceChf != null ? ` · CHF ${p.priceChf.toFixed(2)}` : ""}
              </p>
              {(() => {
                const use = productUsage(p);
                return (
                  <details className="why usage">
                    <summary>When to use · {use.summary}</summary>
                    <div className="usage-body">
                      <p className="usage-line">
                        <span className="usage-label good">Best when</span>
                        {use.bestWhen.join(" · ")}
                      </p>
                      {use.avoidWhen.length > 0 && (
                        <p className="usage-line">
                          <span className="usage-label avoid">Avoid</span>
                          {use.avoidWhen.join(" · ")}
                        </p>
                      )}
                    </div>
                  </details>
                );
              })()}
              {p.shopUrl && (
                <a className="product-shop" href={p.shopUrl} target="_blank" rel="noreferrer noopener">
                  Buy at {p.brand} ↗
                </a>
              )}
              {canEdit && (
                <div className="catalog-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft({ ...p })}
                    disabled={busy}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    onClick={() => remove(p.id)}
                    disabled={busy || (!p.custom && CATALOG.some((b) => b.id === p.id))}
                    title={!p.custom ? "Built-ins can't be deleted — Edit to override values" : "Delete house product"}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {draft && (
        <div className="modal-backdrop" onClick={() => !busy && setDraft(null)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h3>{draft.id ? "Edit product" : "Add Swiss product"}</h3>
              <span className="pill">Swiss only</span>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-brand">Brand</label>
                <input id="p-brand" value={draft.brand ?? ""} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. MOOV" />
              </div>
              <div className="field">
                <label htmlFor="p-name">Product name</label>
                <input id="p-name" value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Hydration" />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-cat">Category</label>
                <select id="p-cat" value={draft.category ?? "drink-mix"} onChange={(e) => set("category", e.target.value as ProductCategory)}>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="group-label">Phases</span>
                <div className="segmented" role="group" aria-label="Phases">
                  {ALL_PHASES.map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      className={(draft.phases ?? []).includes(ph) ? "seg active" : "seg"}
                      onClick={() => togglePhase(ph)}
                    >
                      {ph}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-carb">Carbs (g)</label>
                <input id="p-carb" type="number" value={draft.carbsG ?? 0} onChange={(e) => set("carbsG", Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="p-na">Sodium (mg)</label>
                <input id="p-na" type="number" value={draft.sodiumMg ?? 0} onChange={(e) => set("sodiumMg", Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-pro">Protein (g, optional)</label>
                <input id="p-pro" type="number" value={draft.proteinG ?? ""} onChange={(e) => set("proteinG", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="p-caf">Caffeine (mg, optional)</label>
                <input id="p-caf" type="number" value={draft.caffeineMg ?? ""} onChange={(e) => set("caffeineMg", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-serve">Serving</label>
                <input id="p-serve" value={draft.servingLabel ?? ""} onChange={(e) => set("servingLabel", e.target.value)} placeholder="e.g. 40 g in 500 ml" />
              </div>
              <div className="field">
                <label htmlFor="p-price">Price (CHF, optional)</label>
                <input id="p-price" type="number" step="0.1" value={draft.priceChf ?? ""} onChange={(e) => set("priceChf", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="p-shop">Shop URL (optional)</label>
              <input id="p-shop" value={draft.shopUrl ?? ""} onChange={(e) => set("shopUrl", e.target.value)} placeholder="https://…" />
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={Boolean(draft.multiTransportable)} onChange={(e) => set("multiTransportable", e.target.checked)} />
              <span>Multiple transportable carbs (glucose + fructose, absorbs 60 g/h+)</span>
            </label>
            <div className="field">
              <label htmlFor="p-notes">Notes (optional)</label>
              <input id="p-notes" value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Save product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
