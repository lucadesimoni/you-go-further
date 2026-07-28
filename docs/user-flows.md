# User Flows

Roles are enforced by RBAC (`src/auth/roles.ts`); the subscription tier
(`src/subscription`) governs paid capabilities. In the app, the **View as**
switcher lets you walk each flow (disable it in production with
`allowRoleSwitching: false`).

## Personas & permissions

| Role | Plan / use | Connect | Own analysis | Team analysis | Catalog read | Catalog edit | Team manage | Billing | Org config | Export |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Athlete | ✓ | ✓ | ✓ | | ✓ | | | ¹ | | |
| Coach | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | | |
| Nutritionist | ✓ | | | ✓ | ✓ | ✓ | | | | |
| Org admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

¹ A **solo** athlete (no `orgId`) owns their account and manages their own billing.

---

## 1. Solo athlete — onboarding → fueling plan
1. Land on **Fuel planner** (default).
2. Set goal, activity, duration, intensity, body weight, conditions, sweat, caffeine.
3. Read the before / during / after plan with Swiss product picks.
4. (Optional) **Connect & analyse** → connect one service on the **Base** plan.
5. See synced activities and a basic weekly summary.
6. **Upgrade** via the tier bar (they manage their own billing) to unlock more.

## 2. Athlete on a team plan — connect all devices
1. Persona is a club athlete on **Pro** (billing shown read-only: "managed by your organization").
2. **Connect & analyse** → connect all four services (Pro allows 4).
3. View load analytics (ACWR), the weekly load chart, and weekly carbohydrate demand.
4. Adjust the athlete profile (weight, max HR, goal) to re-personalise.

## 3. Coach — monitor the roster
1. Persona **Team coach** → a **Team** tab appears (`analysis:view_team`).
2. See every athlete with their acute:chronic load status; over-reaching athletes are **flagged**.
3. Expand an athlete for 7-/28-day load, weekly carbs, and fuel rate.
4. Coaches cannot see billing or org config (no such tabs).

## 4. Nutritionist — tune the catalog
1. Persona **Sports nutritionist** → **Catalog** tab with **Edit values** affordances (`catalog:edit`).
2. Browse Sponser/Winforce products by category; review macros, sodium, caffeine, phases.
3. Adjust product values (persisted through the catalog API in production).
4. Also has team-level read access to inform recommendations; no device-connection rights.

## 5. Org admin / owner — manage the tenant
1. Persona **Org admin** → **Admin** tab (`org:configure`).
2. **Organization:** seats used, current plan, providers enabled, store backend.
3. **Members & roles:** who's in the tenant and their role/tier.
4. **Plans & features:** the full tier matrix; the active plan column is highlighted.
5. **Deployment:** environment, API mode, base path, export sink — all from runtime config.
6. Admin/owner also manage **billing** (interactive tier bar) and can **export** data.

---

## Access enforcement
Every tab is shown only if the principal holds the backing permission, and the
same check (`hasPermission` / `authorize`) guards actions server-side. Changing
persona re-derives the visible tabs and resets to the first allowed view, so a
user can never land on a page their role can't access.

## The start screen

Signing in lands on **Home**, not a form. It answers one question — *what should
I do today?* — and everything else on the page is context for that answer.

| Block | What it is |
| --- | --- |
| Greeting + readiness | Time-of-day greeting, current streak, and today's readiness with its source (measured vs self-reported). |
| **Your next move** | The single most useful action, taken straight from the fuelling score's own ranking. Reusing that ranking is deliberate: Home and Insights can never give contradictory advice. |
| Last 7 days | A rolling window, not a calendar week — on a Tuesday "this week: 2 sessions" is useless — with the change in hours against the previous seven days. |
| Fuelling | The score and band at a glance, with a link into the full breakdown. |
| Recent sessions | The last three, each able to jump straight into the planner pre-filled with that session's shape. |
| Your tools | Role-relevant shortcuts. Coaches get their squad; nutritionists also get the product library; admins and owners get the platform. Staff still see all the athlete cards above — coaches train too. |

Nothing is invented: an athlete with no synced sessions is told so and offered
the connect action, rather than shown zeros dressed up as achievement.
