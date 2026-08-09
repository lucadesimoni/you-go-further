import { useEffect, useMemo, useState } from "react";
import { buildCart, byPartner, estimatedCommissionChf, type OutboundLink } from "../commerce";
import type { Recommendation } from "../engine";
import { api, isApiConfigured } from "../api/client";
import { getConfig } from "../config";
import { toast } from "../ui/toast";
import { useT } from "../i18n";

/**
 * "Shop this plan" — the plan turned into something the athlete can actually buy.
 *
 * Two modes, one panel:
 *
 * - **Affiliate (the Phase-1 default).** We are not the merchant. The athlete is
 *   handed to the brand's own shop — no stock, no fulfilment, no returns desk —
 *   and the brand pays commission. Links are built server-side because the
 *   publisher ids live in platform settings, not in the browser.
 * - **Own checkout**, kept for when the platform does sell directly (B2B, a
 *   house brand). Same cart; only the action at the bottom differs.
 */
export function CartPanel({ rec }: { rec: Recommendation }) {
  const t = useT();
  const config = useMemo(() => getConfig(), []);
  const [sessions, setSessions] = useState(1);
  const [ordered, setOrdered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<OutboundLink[] | null>(null);
  const cart = useMemo(() => buildCart(rec, sessions), [rec, sessions]);
  const live = isApiConfigured();
  const affiliate = !config.sellDirect;

  useEffect(() => setOrdered(false), [rec, sessions]);

  // Ask the server which shops these products can be bought from, and which of
  // those we actually have an agreement with.
  const lineKey = cart.lines.map((l) => `${l.productId}x${l.qty}`).join("|");
  useEffect(() => {
    if (!affiliate || !live || cart.lines.length === 0) {
      setLinks(null);
      return;
    }
    let alive = true;
    api
      .affiliateLinks(cart.lines)
      .then((r) => alive && setLinks(r.links))
      .catch(() => alive && setLinks([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affiliate, live, lineKey]);

  const groups = useMemo(() => byPartner(links ?? []), [links]);
  const anyTracked = (links ?? []).some((l) => l.tracked);
  const commission = estimatedCommissionChf(links ?? []);

  /** Record the hand-off, then send them on. */
  const go = (link: OutboundLink) => {
    const line = cart.lines.find((l) => l.productId === link.productId);
    void api
      .affiliateClick({ productId: link.productId, brand: link.brand, valueChf: line?.lineTotalChf ?? 0 })
      .catch(() => undefined);
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  // Direct sale: the server creates a pending order and hands back the payment
  // provider's URL. The order only becomes paid on the signed webhook.
  const checkout = async () => {
    if (!live) return setOrdered(true); // client-only build: nothing to charge
    setBusy(true);
    try {
      const res = await api.checkoutProducts(cart.lines, window.location.href);
      window.location.href = res.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  };

  return (
    <div className="panel cart">
      <div className="section-head">
        <h3 style={{ margin: 0, fontSize: 17 }}>{t("plan.shopThisPlan")}</h3>
        <div className="cart-sessions" role="group" aria-label={t("cart.sessions")}>
          <button type="button" className="step" onClick={() => setSessions((s) => Math.max(1, s - 1))} aria-label={t("cart.fewer")}>
            −
          </button>
          <span className="step-val">
            {t("cart.sessionCount", { count: sessions })}
          </span>
          <button type="button" className="step" onClick={() => setSessions((s) => Math.min(20, s + 1))} aria-label={t("cart.more")}>
            +
          </button>
        </div>
      </div>

      <ul className="cart-lines">
        {cart.lines.map((l) => (
          <li key={l.productId} className="cart-line">
            <span className="cart-qty">{l.qty}×</span>
            <span className="cart-name">
              <strong>{l.brand}</strong> {l.name}
            </span>
            <span className="cart-price">CHF {l.lineTotalChf.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      <div className="cart-total">
        <span>{t("cart.items", { count: cart.itemCount })}</span>
        <span className="cart-subtotal">CHF {cart.subtotalChf.toFixed(2)}</span>
      </div>

      {affiliate ? (
        <>
          {groups.length > 0 ? (
            <div className="cart-partners">
              {/*
                One primary, the rest secondary.

                A plan usually spans two or three brands, and every one of them
                was a full-width filled button — three equal primaries is no
                primary at all, just a wall. The largest basket leads; the others
                are still one tap away and read as the alternatives they are.
              */}
              {groups.map((g, i) => (
                <button
                  key={g.brand}
                  type="button"
                  className={`btn ${i === 0 ? "btn-primary" : "btn-ghost"} cart-partner`}
                  onClick={() => go(g.links[0])}
                >
                  {t("shop.orderAt", { brand: g.brand })}
                </button>
              ))}
            </div>
          ) : (
            <p className="detail note-top">{live ? t("shop.noShop") : t("shop.needsApi")}</p>
          )}
          {/* Say plainly how this is paid for. An athlete weighing a
              recommendation deserves to know what we earn from it. */}
          {groups.length > 0 && (
            <p className="detail note-top">
              {anyTracked ? t("shop.affiliateNote") : t("shop.noPartnerNote")}
              {anyTracked && commission > 0 ? ` ${t("shop.affiliateAmount", { chf: commission.toFixed(2) })}` : ""}
            </p>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className={`btn btn-primary cart-checkout${ordered ? " done" : ""}`}
            onClick={checkout}
            disabled={ordered || busy || cart.lines.length === 0}
          >
            {ordered ? "✓ Added (demo)" : busy ? "Starting checkout…" : `Checkout · CHF ${cart.subtotalChf.toFixed(2)}`}
          </button>
          <p className="detail note-top">
            Fulfilled by our Swiss partners (Sponser, Winforce).{" "}
            {live
              ? "Payment is handled by our payment provider; your order is confirmed once payment clears."
              : "Connect the app to its API to enable real checkout."}
          </p>
        </>
      )}
    </div>
  );
}
