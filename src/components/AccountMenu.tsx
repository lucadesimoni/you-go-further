import { useEffect, useRef, useState } from "react";
import type { Account } from "../auth";
import { ROLE_LABELS } from "../auth";
import type { GamificationProfile } from "../gamification";
import { PERSONAS } from "../personas";
import type { Principal } from "../auth";

/**
 * The single home for everything "me": identity, quick status, and links to
 * Profile, Subscription and Connected services — plus the demo switcher and sign
 * out. Consolidating these here removes the identity/profile duplication that was
 * spread across the header, a Profile tab and the level chip.
 */
export function AccountMenu({
  account,
  gamification,
  allowRoleSwitching,
  canBilling,
  onNavigate,
  onSwitchDemo,
  onSignOut,
}: {
  account: Account;
  gamification: GamificationProfile | null;
  allowRoleSwitching: boolean;
  canBilling: boolean;
  onNavigate: (tab: string) => void;
  onSwitchDemo: (persona: Principal) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = account.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const go = (tab: string) => {
    setOpen(false);
    onNavigate(tab);
  };

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar">{initials}</span>
        <span className="account-btn-name">{account.name}</span>
        <span className="chev" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="account-dropdown" role="menu">
          <div className="dropdown-id">
            <span className="avatar avatar-lg">{initials}</span>
            <div className="dropdown-id-body">
              <div className="profile-name">{account.name}</div>
              <div className="account-email">{account.email}</div>
              <span className="badge badge-post dropdown-role">{ROLE_LABELS[account.role]}</span>
            </div>
          </div>

          {gamification && gamification.streakDays > 0 && (
            <button type="button" className="dropdown-item dropdown-status" onClick={() => go("progress")} role="menuitem">
              <span>{gamification.streakDays}-day training streak</span>
              <span className="dropdown-lvl">Insights ›</span>
            </button>
          )}

          <div className="dropdown-sep" />
          <button type="button" className="dropdown-item" onClick={() => go("profile")} role="menuitem">
            Profile &amp; health
          </button>
          {canBilling && (
            <button type="button" className="dropdown-item" onClick={() => go("subscription")} role="menuitem">
              Subscription &amp; billing
            </button>
          )}
          <button type="button" className="dropdown-item" onClick={() => go("connect")} role="menuitem">
            Connected services
          </button>

          {allowRoleSwitching && (
            <>
              <div className="dropdown-sep" />
              <div className="dropdown-label">Switch demo account</div>
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`dropdown-item dropdown-sub${p.id === account.id ? " active" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    onSwitchDemo(p);
                  }}
                  role="menuitem"
                >
                  {p.name} · {ROLE_LABELS[p.role]}
                </button>
              ))}
            </>
          )}

          <div className="dropdown-sep" />
          <button
            type="button"
            className="dropdown-item dropdown-danger"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
