import { useEffect, useMemo, useState } from "react";
import type { AppConfig } from "../config";
import { PLANS, TIER_ORDER, type Tier } from "../subscription";
import { ROLE_LABELS, type Role } from "../auth";
import { ALL_PROVIDER_IDS, DESCRIPTORS } from "../providers";
import type { ProviderId } from "../model";
import type { User } from "../users";
import type { PlatformSettings } from "../settings";
import type { PartnerProgram } from "../commerce";
import { adminPersistence, createUser, deleteUser, loadSettings, loadUsers, saveSettings, updateUser } from "../api/adminClient";
import { toast } from "../ui/toast";
import { confirm } from "../ui/confirm";
import { ServerStatus } from "./ServerStatus";
import { Switch } from "./Switch";
import { useT, type TranslationKey } from "../i18n";

const FEATURE_ROWS: { key: keyof (typeof PLANS)["free"]["features"]; label: TranslationKey }[] = [
  { key: "maxConnectedProviders", label: "feature.connectedServices" },
  { key: "historyDays", label: "feature.historyDays" },
  { key: "autoSync", label: "feature.autoSync" },
  { key: "loadAnalytics", label: "feature.loadAnalytics" },
  { key: "dataExport", label: "feature.dataExport" },
  { key: "aiInsights", label: "feature.aiInsights" },
];
const ROLES: Role[] = ["athlete", "coach", "nutritionist", "admin", "owner"];
const cell = (v: unknown) => (typeof v === "boolean" ? (v ? "✓" : "—") : String(v));

/** Org admin: user management, platform settings, plans, and the deployment surface. */
export function AdminView({ config, tier, orgId, role }: { config: AppConfig; tier: Tier; orgId?: string; role: Role }) {
  const t = useT();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ name: string; email: string; role: Role; tier: Tier }>({
    name: "",
    email: "",
    role: "athlete",
    tier: "free",
  });

  useEffect(() => {
    let live = true;
    setLoadingUsers(true);
    loadUsers(role)
      .then((u) => live && setUsers(u))
      .catch(() => live && setUsers([]))
      .finally(() => live && setLoadingUsers(false));
    loadSettings(role)
      .then((s) => live && setSettings(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [role]);

  const activeSeats = useMemo(() => users.filter((u) => u.status === "active").length, [users]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const patchUser = (id: string, patch: Partial<Pick<User, "role" | "tier" | "status">>) =>
    run(async () => setUsers(await updateUser(role, id, patch)));
  const removeUser = (u: User) =>
    run(async () => {
      const ok = await confirm({
        title: t("admin.removeUserTitle", { name: u.name }),
        message: `${u.email} will lose access to the platform. This can't be undone.`,
        confirmLabel: t("admin.removeUser"),
        danger: true,
      });
      if (!ok) return;
      setUsers(await deleteUser(role, u.id));
      toast.success(`${u.name} removed`);
    });
  const addUser = () =>
    run(async () => {
      const name = draft.name.trim();
      setUsers(await createUser(role, draft));
      setDraft({ name: "", email: "", role: "athlete", tier: "free" });
      toast.success(`Invitation sent to ${name || "new user"}`);
    });
  /**
   * Edit one partner row. Rows are only *validated* on save (an in-progress
   * brand name is not yet a valid program), so the local list is the draft and
   * the server normalises what it is given.
   */
  const patchPartner = (index: number, patch: Partial<PartnerProgram>) => {
    if (!settings) return;
    const next = settings.partners.map((p, i) => (i === index ? { ...p, ...patch } : p));
    patchSettings({ partners: next });
  };

  const patchSettings = (patch: Partial<PlatformSettings>) =>
    run(async () => {
      setSettings(await saveSettings(role, patch));
      toast.success("Settings saved");
    });
  const toggleProvider = (p: ProviderId) => {
    if (!settings) return;
    const on = settings.enabledProviders.includes(p);
    patchSettings({
      enabledProviders: on ? settings.enabledProviders.filter((x) => x !== p) : [...settings.enabledProviders, p],
    });
  };

  return (
    <main className="dash">
      <ServerStatus role={role} />

      <section className="panel">
        <div className="section-head">
          <h2>{t("admin.organization")}</h2>
          <span className="pill">{orgId ?? "no tenant"}</span>
        </div>
        <div className="targets plain-grid">
          <div className="stat">
            <span className="stat-value">{users.length}</span>
            <span className="stat-label">{t("admin.users")}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{activeSeats}</span>
            <span className="stat-label">{t("admin.activeSeats")}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{settings?.enabledProviders.length ?? config.enabledProviders.length}</span>
            <span className="stat-label">{t("admin.providersOn")}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{config.storeBackend}</span>
            <span className="stat-label">{t("admin.storeBackend")}</span>
          </div>
        </div>
      </section>

      {error && <p className="auth-error">{error}</p>}

      <section className="panel">
        <div className="section-head">
          <h2>{t("admin.usersRoles")}</h2>
          <span className="pill">{adminPersistence.mode() === "server" ? "server" : "this browser"}</span>
        </div>
        {loadingUsers ? (
          <div className="admin-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="empty-state">{t("admin.noUsers")}</p>
        ) : (
          <div className="admin-users">
          <div className="admin-user admin-user-head">
            <span>{t("admin.user")}</span>
            <span>{t("admin.role")}</span>
            <span>{t("admin.tier")}</span>
            <span>{t("admin.status")}</span>
            <span />
          </div>
          {users.map((u) => (
            <div className="admin-user" key={u.id}>
              <span className="admin-user-id">
                <strong>{u.name}</strong>
                <span className="admin-user-email">{u.email}</span>
              </span>
              <select
                value={u.role}
                disabled={busy || u.role === "owner"}
                onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <select
                value={u.tier}
                disabled={busy}
                onChange={(e) => patchUser(u.id, { tier: e.target.value as Tier })}
              >
                {TIER_ORDER.map((tierId) => (
                  <option key={tierId} value={tierId}>
                    {PLANS[tierId].name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`btn btn-ghost admin-status admin-status-${u.status}`}
                disabled={busy || u.role === "owner"}
                onClick={() => patchUser(u.id, { status: u.status === "active" ? "suspended" : "active" })}
              >
                {u.status === "active" ? "Active" : "Suspended"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                disabled={busy || u.role === "owner"}
                onClick={() => removeUser(u)}
              >
                {t("admin.remove")}
              </button>
            </div>
          ))}
          </div>
        )}

        <div className="admin-add">
          <input
            className="auth-input"
            placeholder={t("admin.fullName")}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className="auth-input"
            type="email"
            placeholder="email@org.ch"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value as Tier })}>
            {TIER_ORDER.map((tierId) => (
              <option key={tierId} value={tierId}>
                {PLANS[tierId].name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={addUser} disabled={busy}>
            {t("admin.inviteUser")}
          </button>
        </div>
      </section>

      {settings && (
        <section className="panel">
          <div className="section-head">
            <h2>{t("admin.platformSettings")}</h2>
          </div>
          <p className="detail">
            Runtime knobs the admin controls without a redeploy. Infrastructure and secrets (store backend, database,
            OAuth secrets) stay environment-only by design.
          </p>

          <div className="admin-setting">
            <span className="group-label admin-group-label">
              {t("admin.connectableProviders")}
            </span>
            <div className="admin-providers">
              {ALL_PROVIDER_IDS.map((p) => (
                <label key={p} className={`admin-provider${settings.enabledProviders.includes(p) ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={settings.enabledProviders.includes(p)}
                    disabled={busy}
                    onChange={() => toggleProvider(p)}
                  />
                  {DESCRIPTORS[p].displayName}
                </label>
              ))}
            </div>
          </div>

          <div className="admin-setting">
            <label htmlFor="default-tier">{t("admin.defaultTier")}</label>
            <select
              id="default-tier"
              value={settings.defaultTier}
              disabled={busy}
              onChange={(e) => patchSettings({ defaultTier: e.target.value as Tier })}
            >
              {TIER_ORDER.map((tierId) => (
                <option key={tierId} value={tierId}>
                  {PLANS[tierId].name}
                </option>
              ))}
            </select>
          </div>

          {(
            [
              ["registrationOpen", "Open registration", "Allow new users to self-register."],
              ["allowRoleSwitching", "Demo role switching", "Let anyone switch roles in-app (demo/testing)."],
              ["exportEnabled", "Analytics export", "Stream activities to the export sink (Databricks etc.)."],
              ["maintenanceMode", "Maintenance mode", "Show a banner and freeze writes across the platform."],
            ] as const
          ).map(([key, label, hint]) => (
            <Switch
              key={key}
              label={label}
              hint={hint}
              checked={settings[key]}
              disabled={busy}
              onChange={(on) => patchSettings({ [key]: on })}
            />
          ))}

          {/* Affiliate programs — the Phase-1 revenue model. Deliberately empty
              until a brand agreement exists: an invented publisher id would look
              like a partnership we do not have. */}
          <div className="admin-setting">
            <span className="group-label admin-group-label">{t("admin.affiliatePartners")}</span>
            <p className="detail">
              A brand listed here earns us commission on orders we send it. Brands not listed still get a plain link to
              their shop — the athlete is sent to the right product either way, we simply are not paid for it.
            </p>
            {settings.partners.map((p, i) => (
              <div className="partner-row" key={`${p.brand}-${i}`}>
                <input
                  aria-label={t("admin.brand")}
                  placeholder={t("admin.brand")}
                  value={p.brand}
                  disabled={busy}
                  onChange={(e) => patchPartner(i, { brand: e.target.value })}
                />
                <input
                  aria-label={t("admin.shopUrl")}
                  placeholder="https://brand.ch"
                  value={p.shopUrl}
                  disabled={busy}
                  onChange={(e) => patchPartner(i, { shopUrl: e.target.value })}
                />
                <input
                  aria-label={t("admin.publisherId")}
                  placeholder="publisher id"
                  value={p.refValue}
                  disabled={busy}
                  onChange={(e) => patchPartner(i, { refValue: e.target.value })}
                />
                <input
                  aria-label={t("admin.commissionPct")}
                  type="number"
                  min={0}
                  max={50}
                  value={Math.round(p.commissionRate * 100)}
                  disabled={busy}
                  onChange={(e) => patchPartner(i, { commissionRate: Number(e.target.value) / 100 })}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => patchSettings({ partners: settings.partners.filter((_, j) => j !== i) })}
                >
                  {t("admin.remove")}
                </button>
              </div>
            ))}
            {settings.partners.length === 0 && (
              <p className="partner-untracked">
                {t("admin.noPartners")}
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost mt-5"
              disabled={busy}
              onClick={() =>
                patchSettings({
                  partners: [
                    ...settings.partners,
                    { brand: "", shopUrl: "", refParam: "ref", refValue: "", commissionRate: 0.08, cookieDays: 30 },
                  ],
                })
              }
            >
              {t("admin.addPartner")}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-head">
          <h2>{t("admin.plansFeatures")}</h2>
        </div>
        <div className="table matrix">
          <div className="tr th">
            <span>{t("admin.feature")}</span>
            {TIER_ORDER.map((tierId) => (
              <span key={tierId}>{PLANS[tierId].name}</span>
            ))}
          </div>
          {FEATURE_ROWS.map((row) => (
            <div className="tr" key={row.key}>
              <span>{t(row.label)}</span>
              {TIER_ORDER.map((tierId) => (
                <span key={tierId} className={tierId === tier ? "cell-active" : undefined}>
                  {cell(PLANS[tierId].features[row.key])}
                </span>
              ))}
            </div>
          ))}
          <div className="tr">
            <span>{t("admin.pricePerMonth")}</span>
            {TIER_ORDER.map((tierId) => (
              <span key={tierId}>{PLANS[tierId].priceChfPerMonth === 0 ? "Free" : `CHF ${PLANS[tierId].priceChfPerMonth}`}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{t("admin.deployment")}</h2>
          <span className="pill">v{config.version}</span>
        </div>
        <div className="table">
          <div className="tr">
            <span>{t("admin.environment")}</span>
            <span>{config.environment}</span>
          </div>
          <div className="tr">
            <span>{t("admin.apiMode")}</span>
            <span>{config.apiBaseUrl ? config.apiBaseUrl : "client-side (mock data)"}</span>
          </div>
          <div className="tr">
            <span>{t("admin.storeBackend")}</span>
            <span>{config.storeBackend}</span>
          </div>
          <div className="tr">
            <span>{t("admin.exportSink")}</span>
            <span>{settings?.exportEnabled ?? config.exportEnabled ? "enabled" : "disabled"}</span>
          </div>
        </div>
        <p className="detail note-top">
          {t("admin.infraNote")} (<code>window.__APP_CONFIG__</code> / env). See{" "}
          <code>docs/deployment.md</code>.
        </p>
      </section>
    </main>
  );
}
