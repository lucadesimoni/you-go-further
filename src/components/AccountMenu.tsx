import { useEffect, useRef, useState } from "react";
import type { Account } from "../auth";
import { ROLE_LABELS } from "../auth";
import type { ProgressProfile } from "../progress";
import { PERSONAS } from "../personas";
import type { Principal } from "../auth";
import { useT, LANGS, type Lang } from "../i18n";
import type { ThemeChoice } from "../theme/theme";

/**
 * The single home for everything "me": identity, quick status, and links to
 * Profile, Subscription and Connected services — plus the demo switcher and sign
 * out. Consolidating these here removes the identity/profile duplication that was
 * spread across the header, a Profile tab and the level chip.
 */
const THEMES: ThemeChoice[] = ["system", "light", "dark"];

export function AccountMenu({
  account,
  progress,
  allowRoleSwitching,
  canBilling,
  lang,
  onLang,
  themeChoice,
  onTheme,
  onNavigate,
  onSwitchDemo,
  onSignOut,
}: {
  account: Account;
  progress: ProgressProfile | null;
  allowRoleSwitching: boolean;
  canBilling: boolean;
  lang: Lang;
  onLang: (l: Lang) => void;
  themeChoice: ThemeChoice;
  onTheme: (c: ThemeChoice) => void;
  onNavigate: (tab: string) => void;
  onSwitchDemo: (persona: Principal) => void;
  onSignOut: () => void;
}) {
  const t = useT();
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
      <button
        type="button"
        className="account-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("account.menu")}
      >
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

          {progress && progress.streakDays > 0 && (
            <button type="button" className="dropdown-item dropdown-status" onClick={() => go("progress")} role="menuitem">
              <span>{t("account.streak", { days: progress.streakDays })}</span>
              <span className="dropdown-lvl">{t("account.insightsLink")}</span>
            </button>
          )}

          <div className="dropdown-sep" />
          <button type="button" className="dropdown-item" onClick={() => go("profile")} role="menuitem">
            {t("account.profile")}
          </button>
          {canBilling && (
            <button type="button" className="dropdown-item" onClick={() => go("subscription")} role="menuitem">
              {t("account.billing")}
            </button>
          )}
          <button type="button" className="dropdown-item" onClick={() => go("connect")} role="menuitem">
            {t("account.connections")}
          </button>

          {/* Appearance and language live with the rest of "me", so there is one
              place to look for a personal setting. */}
          <div className="dropdown-sep" />
          <div className="dropdown-label">{t("appearance.title")}</div>
          <div className="dropdown-choice" role="group" aria-label={t("appearance.title")}>
            {THEMES.map((c) => (
              <button
                key={c}
                type="button"
                className={`choice${c === themeChoice ? " choice-active" : ""}`}
                aria-pressed={c === themeChoice}
                onClick={() => onTheme(c)}
              >
                {t(`appearance.${c}` as "appearance.system")}
              </button>
            ))}
          </div>

          <div className="dropdown-label">{t("language.title")}</div>
          <div className="dropdown-choice dropdown-choice-lang" role="group" aria-label={t("language.title")}>
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                className={`choice${l === lang ? " choice-active" : ""}`}
                aria-pressed={l === lang}
                lang={l}
                onClick={() => onLang(l)}
              >
                {t(`language.${l}` as "language.en")}
              </button>
            ))}
          </div>

          {allowRoleSwitching && (
            <>
              <div className="dropdown-sep" />
              <div className="dropdown-label">{t("account.switchDemo")}</div>
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
            {t("account.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
