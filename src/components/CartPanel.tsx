import { useEffect, useMemo, useState } from "react";
import { buildCart } from "../commerce";
import type { Recommendation } from "../engine";

/** "Shop this plan" — turns the recommendation into a priced, shoppable cart. */
export function CartPanel({ rec }: { rec: Recommendation }) {
  const [sessions, setSessions] = useState(1);
  const [ordered, setOrdered] = useState(false);
  const cart = useMemo(() => buildCart(rec, sessions), [rec, sessions]);

  useEffect(() => setOrdered(false), [rec, sessions]);

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
        onClick={() => setOrdered(true)}
        disabled={ordered}
      >
        {ordered ? "✓ Order placed (demo)" : "Add to cart · checkout"}
      </button>
      <p className="detail note-top">
        Fulfilled by our Swiss partners (Sponser, Winforce). Checkout is a demo — wires to Shopify /
        the brand store in production.
      </p>
    </div>
  );
}
