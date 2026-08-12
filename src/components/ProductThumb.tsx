import type { Product, ProductCategory } from "../engine";

/**
 * A product mark, drawn rather than photographed.
 *
 * A shop needs something to look at — a wall of text rows is a spreadsheet, and
 * an athlete choosing a gel scans shapes before they read names. What it must
 * not be is a *fake photo*: we do not hold product photography, and a generic
 * stock image of "a gel" attached to a named product is a small lie that makes
 * every other number on the card less believable.
 *
 * So this is a mark: the category's own silhouette, the brand's initials, and
 * nothing that pretends to be a photograph. It is deterministic — the same
 * product draws the same mark every time — and it costs no network request, so
 * a catalogue of sixty renders instantly and works offline.
 */

const SHAPES: Record<ProductCategory, JSX.Element> = {
  // A sachet: the powder you tip into a bottle.
  "drink-mix": (
    <>
      <path d="M18 14h28l-3 34H21z" />
      <path d="M18 14l3-6h22l3 6" />
      <path d="M24 24h16" />
    </>
  ),
  // A gel packet, torn corner and all.
  gel: (
    <>
      <path d="M20 10h24v44H20z" />
      <path d="M20 10l6 5-6 5" />
      <path d="M26 30h12M26 38h8" />
    </>
  ),
  // A bar in its wrapper.
  bar: (
    <>
      <path d="M8 22h48v20H8z" />
      <path d="M8 22l-4-4M56 22l4-4M8 42l-4 4M56 42l4 4" />
      <path d="M22 22v20M40 22v20" />
    </>
  ),
  // A tube of tablets.
  electrolyte: (
    <>
      <path d="M22 16h20v38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" />
      <path d="M24 8h16v8H24z" />
      <path d="M28 28h8M28 36h8M28 44h8" />
    </>
  ),
  // A shaker: the one you drink after.
  recovery: (
    <>
      <path d="M18 22h28l-2 32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z" />
      <path d="M20 12h24v10H20z" />
      <path d="M22 36h20" />
    </>
  ),
};

/** Up to two letters, so "Sponser" and "Winforce" stay apart at 56 px. */
function initials(brand: string): string {
  const words = brand.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ProductThumb({ product, size = 64 }: { product: Product; size?: number }) {
  return (
    <div className="prod-thumb" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {SHAPES[product.category]}
      </svg>
      <span className="prod-thumb-initials">{initials(product.brand)}</span>
    </div>
  );
}
