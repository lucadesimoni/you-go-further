import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, productUsage, type Phase, type Product, type ProductCategory } from "../engine";
import type { Role } from "../auth";
import { catalogPersistence, deleteProduct, loadCatalog, saveProduct } from "../api/productLibrary";
import { toast } from "../ui/toast";
import { confirm } from "../ui/confirm";
import { useFocusTrap } from "../ui/useFocusTrap";
import { useT, type TranslationKey } from "../i18n";
import { BuyLink } from "./BuyLink";
import { ChoiceRow } from "./Choice";

/** Category names, keyed so the library reads in the athlete's language. */
const CATEGORY_KEY: Record<ProductCategory, TranslationKey> = {
  "drink-mix": "cat.drinkMix",
  gel: "cat.gel",
  bar: "cat.bar",
  electrolyte: "cat.electrolyte",
  recovery: "cat.recovery",
};
const ALL_CATEGORIES = Object.keys(CATEGORY_KEY) as ProductCategory[];
const ALL_PHASES: Phase[] = ["pre", "during", "post"];

type Draft = Partial<Product>;
const EMPTY: Draft = { category: "drink-mix", phases: ["during"], swiss: true, carbsG: 0, sodiumMg: 0 };

/**
 * Swiss product library. Everyone browses the merged catalog (built-in brands +
 * house products); `catalog:edit` (nutritionist / admin / owner) unlocks a full
 * editor to add own products, override a built-in's values, and manage shop links.
 */
export function CatalogView({ canEdit, role = "athlete" }: { canEdit: boolean; role?: Role }) {
  const t = useT();
  const [catalog, setCatalog] = useState<Product[]>(CATALOG);
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, draft !== null);

  // Esc closes the product editor, matching the confirm dialog.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setDraft(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [draft, busy]);

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
      const name = draft.name?.trim();
      setDraft(null);
      toast.success(`${name || "Product"} saved`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save product");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (product: Product) => {
    const ok = await confirm({
      title: t("catalog.deleteTitle", { brand: product.brand, name: product.name }),
      message: "It will be removed from the product library and from recommendations.",
      confirmLabel: t("catalog.deleteProduct"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      setCatalog(await deleteProduct(role, product.id));
      toast.success("Product deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete product";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>{t("catalog.title")}</h2>
          <span className="pill">{t("catalog.count", { count: catalog.length })}</span>
        </div>
        <p className="detail">
          {t("catalog.intro", { brands: brands.join(" · ") })}{" "}
          {canEdit ? (
            <>
              {t("catalog.houseCount", { count: customCount })} ·{" "}
              {catalogPersistence.mode() === "server" ? t("catalog.savedServer") : t("catalog.savedBrowser")}.
            </>
          ) : (
            <>{t("catalog.readOnly")}</>
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

        {/* Six category names in equal columns fit in English and nowhere else;
            as chips they wrap onto a second line instead of off the screen. */}
        <ChoiceRow
          hideLabel
          label={t("catalog.filter")}
          value={category}
          onChange={setCategory}
          options={[
            { value: "all" as const, label: t("cat.all") },
            ...categories.map((c) => ({ value: c, label: t(CATEGORY_KEY[c]) })),
          ]}
        />

        <div className="providers">
          {items.map((p) => (
            <div key={p.id} className="provider-card">
              <div className="provider-top">
                <span className="provider-name">
                  <strong>{p.brand}</strong> {p.name}
                  {p.custom && <span className="tag tag-house">house</span>}
                </span>
                <span className="serving">{t(CATEGORY_KEY[p.category])}</span>
              </div>
              <div className="tags">
                {p.carbsG > 1 && <span className="tag">{t("unit.carb", { n: p.carbsG })}</span>}
                {p.sodiumMg > 0 && <span className="tag">{t("unit.sodium", { n: p.sodiumMg })}</span>}
                {p.proteinG ? <span className="tag">{t("unit.protein", { n: p.proteinG })}</span> : null}
                {p.caffeineMg ? <span className="tag caf">{t("unit.caffeine", { n: p.caffeineMg })}</span> : null}
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
                        <span className="usage-label good">{t("catalog.bestWhen")}</span>
                        {use.bestWhen.join(" · ")}
                      </p>
                      {use.avoidWhen.length > 0 && (
                        <p className="usage-line">
                          <span className="usage-label avoid">{t("catalog.avoid")}</span>
                          {use.avoidWhen.join(" · ")}
                        </p>
                      )}
                    </div>
                  </details>
                );
              })()}
              <BuyLink product={p} />
              {canEdit && (
                <div className="catalog-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft({ ...p })}
                    disabled={busy}
                  >
                    {t("catalog.edit")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    onClick={() => remove(p)}
                    disabled={busy || (!p.custom && CATALOG.some((b) => b.id === p.id))}
                    title={!p.custom ? t("catalog.builtInHint") : t("catalog.deleteHouseHint")}
                  >
                    {t("catalog.delete")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {draft && (
        <div className="modal-backdrop" onClick={() => !busy && setDraft(null)}>
          <div
            ref={dialogRef}
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-head">
              <h3 id="product-dialog-title">{draft.id ? t("catalog.editProduct") : t("catalog.addProduct")}</h3>
              <span className="pill">{t("catalog.swissOnly")}</span>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-brand">{t("catalog.brand")}</label>
                <input id="p-brand" value={draft.brand ?? ""} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. MOOV" />
              </div>
              <div className="field">
                <label htmlFor="p-name">{t("catalog.productName")}</label>
                <input id="p-name" value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Hydration" />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-cat">{t("catalog.category")}</label>
                <select id="p-cat" value={draft.category ?? "drink-mix"} onChange={(e) => set("category", e.target.value as ProductCategory)}>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(CATEGORY_KEY[c])}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="group-label">{t("catalog.phases")}</span>
                <div className="segmented" role="group" aria-label={t("catalog.phases")}>
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
                <label htmlFor="p-carb">{t("catalog.carbsG")}</label>
                <input id="p-carb" type="number" value={draft.carbsG ?? 0} onChange={(e) => set("carbsG", Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="p-na">{t("catalog.sodiumMg")}</label>
                <input id="p-na" type="number" value={draft.sodiumMg ?? 0} onChange={(e) => set("sodiumMg", Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-pro">{t("catalog.proteinG")}</label>
                <input id="p-pro" type="number" value={draft.proteinG ?? ""} onChange={(e) => set("proteinG", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="p-caf">{t("catalog.caffeineMg")}</label>
                <input id="p-caf" type="number" value={draft.caffeineMg ?? ""} onChange={(e) => set("caffeineMg", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="p-serve">{t("catalog.serving")}</label>
                <input id="p-serve" value={draft.servingLabel ?? ""} onChange={(e) => set("servingLabel", e.target.value)} placeholder="e.g. 40 g in 500 ml" />
              </div>
              <div className="field">
                <label htmlFor="p-price">{t("catalog.priceChf")}</label>
                <input id="p-price" type="number" step="0.1" value={draft.priceChf ?? ""} onChange={(e) => set("priceChf", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="p-shop">{t("catalog.shopUrl")}</label>
              <input id="p-shop" value={draft.shopUrl ?? ""} onChange={(e) => set("shopUrl", e.target.value)} placeholder="https://…" />
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={Boolean(draft.multiTransportable)} onChange={(e) => set("multiTransportable", e.target.checked)} />
              <span>{t("catalog.multiTransportable")}</span>
            </label>
            <div className="field">
              <label htmlFor="p-notes">{t("catalog.notes")}</label>
              <input id="p-notes" value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)} disabled={busy}>
                {t("catalog.cancel")}
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
