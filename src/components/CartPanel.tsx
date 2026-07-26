import { useEffect, useMemo, useState } from "react";
import { buildCart } from "../commerce";
import type { Recommendation } from "../engine";
import { api, isApiConfigured } from "../api/client";
import { toast } from "../ui/toast";

/** "Shop this plan" — turns the recommendation into a priced, shoppable cart. */
export function CartPanel({ rec }: { rec: Recommendation }) {
  const [sessions, setSessions] = useState(1);
  const [ordered, setOrdered] = useState(false);
  const [busy, setBusy] = useState(false);
  const cart = useMemo(() => buildCart(rec, sessions), [rec, sessions]);
  const live = isApiConfigured();

  useEffect(() => setOrdered(false), [rec, sessions]);

  // Real checkout: the server creates a pending order and hands back the payment
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
        <h3 style={{ margin: 0, fontSize: 17 }}>Shop this plan</h3>
        <div className="cart-sessions" role="group" aria-label="Sessions">
          <button type="button" className="step" onClick={() => setSessions((s) => Math.max(1, s - 1))} aria-label="Fewer sessions">
            −
          </button>
          <span className="step-val">
            {sessions} session{sessions > 1 ? "s" : ""}
          </span>
          <button type="button" className="step" onClick={() => setSessions((s) => Math.min(20, s + 1))} aria-label="More sessions">
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
        <span>{cart.itemCount} items</span>
        <span className="cart-subtotal">CHF {cart.subtotalChf.toFixed(2)}</span>
      </div>

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
    </div>
  );
}
