import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, productUsage, type Phase, type Product, type ProductCategory } from "../engine";
import type { Role } from "../auth";
import { catalogPersistence, deleteProduct, loadCatalog, saveProduct } from "../api/productLibrary";
import { toast } from "../ui/toast";
import { confirm } from "../ui/confirm";
import { useFocusTrap } from "../ui/useFocusTrap";
import { useT, type TranslationKey } from "../i18n";
import { useMediaQuery, PHONE } from "../ui/useMediaQuery";
import { BuyLink } from "./BuyLink";
import { ChoiceRow } from "./Choice";
import { ProductThumb } from "./ProductThumb";
import { ReadMore } from "./ReadMore";
import { PHASE_KEYS } from "../options";

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

/** How the shelf is ordered. */
type SortKey = "name" | "price" | "carbs";

type Draft = Partial<Product>;
const EMPTY: Draft = { category: "drink-mix", phases: ["during"], swiss: true, carbsG: 0, sodiumMg: 0 };

/**
 * Swiss product library. Everyone browses the merged catalog (built-in brands +
 * house products); `catalog:edit` (nutritionist / admin / owner) unlocks a full
 * editor to add own products, override a built-in's values, and manage shop links.
 */
export function CatalogView({ canEdit, role = "athlete" }: { canEdit: boolean; role?: Role }) {
  const t = useT();
  const isPhone = useMediaQuery(PHONE);
  const [catalog, setCatalog] = useState<Product[]>(CATALOG);
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
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

  /**
   * What the athlete is actually looking at.
   *
   * Search matches brand, name, category and the product's own notes: someone
   * hunting for "koffein" or "isotonic" is describing the thing, not naming it,
   * and sixty products is well past the number anyone scans.
   */
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = catalog
      .filter((p) => category === "all" || p.category === category)
      .filter((p) =>
        !q
          ? true
          : [p.brand, p.name, t(CATEGORY_KEY[p.category]), p.notes ?? "", p.servingLabel]
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
    const by: Record<SortKey, (a: Product, b: Product) => number> = {
      name: (a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`),
      // Missing prices sort last rather than first: an unpriced product is not
      // the cheapest one.
      price: (a, b) => (a.priceChf ?? Infinity) - (b.priceChf ?? Infinity),
      carbs: (a, b) => b.carbsG - a.carbsG,
    };
    return [...filtered].sort(by[sort]);
  }, [catalog, category, query, sort, t]);
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

  const intro = (
    <ReadMore lines={2}>
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
    </ReadMore>
  );

  return (
    <main className="dash catalog">
      <section className="panel">
        <div className="section-head">
          <h2>{t("catalog.title")}</h2>
          <span className="pill">{t("catalog.count", { count: catalog.length })}</span>
        </div>
        {/* Which brands, and who curates this — worth saying once, not worth a
            paragraph above the products on a phone where it costs half a
            screen before the first thing you came to look at. */}
        {/*
          Who curates the library matters once and never again, and at the top
          of a phone screen it is 90 px of preamble above the thing you came to
          look at. It is rendered after the products there, and above them
          where there is room.
        */}
        {!isPhone && intro}

        {canEdit && (
          <div className="catalog-actions">
            <button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })} disabled={busy}>
              + Add product
            </button>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}

        <div className="shop-controls">
          <label className="guide-search shop-search">
            <SearchGlyph />
            <input
              type="search"
              value={query}
              placeholder={t("catalog.searchPlaceholder")}
              aria-label={t("catalog.searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {/* Only when it differs from the header's total — a filtered count
              is news, an unfiltered one is the same number twice. */}
          {items.length !== catalog.length && (
            <span className="shop-count">{t("catalog.showing", { count: items.length })}</span>
          )}
        </div>

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

        {/* The label stays: without it "Name · Price · Most carbs" reads as
            three more category filters in the row above. */}
        <ChoiceRow
          label={t("catalog.sortBy")}
          value={sort}
          onChange={setSort}
          options={[
            { value: "name" as const, label: t("catalog.sortName") },
            { value: "price" as const, label: t("catalog.sortPrice") },
            { value: "carbs" as const, label: t("catalog.sortCarbs") },
          ]}
        />

        <div className="shop-grid">
          {items.map((p) => (
            /*
             * On a phone the card *is* the summary.
             *
             * Twenty-four products, each a card carrying its four macros, its
             * tags, its usage note and a buy button, came to 8 867 px — ten and
             * a half phone screens of near-identical blocks to scroll past. A
             * library is a list you scan and then look into, and the two levels
             * had been collapsed into one. The row below carries what picks a
             * product out of a list — what it is, what it costs, how much
             * carbohydrate it delivers — and everything else opens on a tap.
             *
             * On a wide screen there is room for both, so the disclosure starts
             * open and the summary is hidden: the same markup, no second
             * component to keep in step.
             */
            <details key={p.id} className="shop-card" open={!isPhone}>
              <summary className="shop-card-row">
                <ProductThumb product={p} />
                <span className="shop-row-id">
                  <span className="shop-brand">{p.brand}</span>
                  <span className="shop-name">{p.name}</span>
                </span>
                <span className="shop-row-figs">
                  {p.carbsG > 0 && (
                    <span className="fig">
                      {p.carbsG} <span className="fig-unit">g</span>
                    </span>
                  )}
                  <span className="shop-row-price">
                    {p.priceChf != null ? `CHF ${p.priceChf.toFixed(2)}` : t("catalog.noPrice")}
                  </span>
                </span>
              </summary>
              <div className="shop-card-top">
                <div className="shop-card-id">
                  <span className="shop-cat">{t(CATEGORY_KEY[p.category])}</span>
                </div>
                {p.custom && <span className="tag tag-house">{t("plan.house")}</span>}
              </div>

              {/* The four numbers that decide whether a product fits a session,
                  on one line each so two cards can be compared down a column. */}
              <dl className="shop-macros">
                <div>
                  <dt>{t("catalog.carbShort")}</dt>
                  <dd>{p.carbsG > 0 ? `${p.carbsG} g` : "—"}</dd>
                </div>
                <div>
                  <dt>{t("catalog.sodiumShort")}</dt>
                  <dd>{p.sodiumMg > 0 ? `${p.sodiumMg} mg` : "—"}</dd>
                </div>
                <div>
                  <dt>{t("catalog.proteinShort")}</dt>
                  <dd>{p.proteinG ? `${p.proteinG} g` : "—"}</dd>
                </div>
                <div>
                  <dt>{t("catalog.caffeineShort")}</dt>
                  <dd>{p.caffeineMg ? `${p.caffeineMg} mg` : "—"}</dd>
                </div>
              </dl>

              <div className="shop-tags">
                {p.multiTransportable && <span className="tag">{t("plan.multiTransportable")}</span>}
                {p.phases.map((ph) => (
                  <span key={ph} className="tag">
                    {t(PHASE_KEYS[ph])}
                  </span>
                ))}
              </div>

              {(() => {
                const use = productUsage(p);
                return (
                  <details className="why usage">
                    <summary>
                      {t("catalog.whenToUse")} · {use.summary}
                    </summary>
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

              <div className="shop-card-foot">
                <span className="shop-price">
                  {p.priceChf != null ? `CHF ${p.priceChf.toFixed(2)}` : t("catalog.noPrice")}
                  <span className="shop-serving">{p.servingLabel}</span>
                </span>
                <BuyLink product={p} />
              </div>

              {canEdit && (
                <div className="catalog-row-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setDraft({ ...p })} disabled={busy}>
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
            </details>
          ))}
        </div>

        {/* Said after the list on a phone, where it costs nothing to skip. */}
        {isPhone && intro}

        {items.length === 0 && <p className="detail shop-empty">{t("catalog.noMatches", { query: query.trim() })}</p>}
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

/** A magnifier — the one symbol a search field never has to explain. */
function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}
