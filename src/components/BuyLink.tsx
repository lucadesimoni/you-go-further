import { useState } from "react";
import type { Product } from "../engine";
import { api, isApiConfigured } from "../api/client";
import { useT } from "../i18n";

/**
 * "Buy at <brand>" — the single highest-intent click in the app.
 *
 * It goes through the server rather than linking straight at `product.shopUrl`,
 * for two reasons: the publisher ids that earn commission live in platform
 * settings (not in the browser), and the hand-off has to be recorded or there is
 * nothing to reconcile a partner's statement against.
 *
 * The tab is opened *synchronously* on the click and its location set once the
 * link comes back — opening it after the await would be swallowed by every
 * popup blocker. Without an API the plain shop link still works, untracked.
 */
export function BuyLink({ product, className = "product-shop" }: { product: Product; className?: string }) {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const label = t("shop.buyAt", { brand: product.brand });

  if (!isApiConfigured() || !product.shopUrl) {
    if (!product.shopUrl) return null;
    return (
      <a className={className} href={product.shopUrl} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
    );
  }

  const open = async () => {
    const tab = window.open("", "_blank", "noopener,noreferrer");
    setBusy(true);
    try {
      const line = {
        productId: product.id,
        name: product.name,
        brand: product.brand,
        qty: 1,
        unitPriceChf: product.priceChf ?? 0,
        lineTotalChf: product.priceChf ?? 0,
      };
      const { links } = await api.affiliateLinks([line]);
      const url = links[0]?.url ?? product.shopUrl!;
      void api.affiliateClick({ productId: product.id, brand: product.brand, valueChf: product.priceChf ?? 0 }).catch(() => undefined);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      // The shop link is still right even when our own API is not answering.
      if (tab) tab.location.href = product.shopUrl!;
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={open} disabled={busy}>
      {label}
    </button>
  );
}
