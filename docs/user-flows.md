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

## 1. Solo athlete — onboarding → fuelling plan
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

## One profile

Body data lives in **exactly one place**: *Profile & health*, reached from the
account menu, stored server-side so it follows the athlete across devices.

Every other screen *shows* it and links back there rather than offering a second
editor — the planner's "Tuned to 83 kg · average sweat", the Connect tab's "Using
your profile: 83 kg · max HR 176 bpm". The Connect tab used to carry its own
weight and max-HR sliders backed by local state that never persisted and never
reached the plan, so an athlete could set 85 kg there and still be planned for
70 kg. An e2e step now counts body-weight editors across every tab and fails if
there is more than one.

## The start screen

Signing in lands on **Home**, not a form. It answers one question — *what should
I do today?* — and everything else on the page is context for that answer.

| Block | What it is |
| --- | --- |
| Greeting + readiness | Time-of-day greeting, current streak, and today's readiness with its source (measured vs self-reported). |
| **Your next move** | The single most useful action, taken straight from the fuelling score's own ranking. Reusing that ranking is deliberate: Home and Insights can never give contradictory advice. |
| Last 7 days | A rolling window, not a calendar week — on a Tuesday "this week: 2 sessions" is useless — with the change in hours against the previous seven days. |
| Fuelling | The score and band at a glance, with a link into the full breakdown. |
| Recent sessions | The last three. A run that has never been reviewed asks **"How did it go?"** and opens its debrief; a reviewed one is marked *Logged*. Either way it can also jump straight into the planner pre-filled with that session's shape. |
| Your tools | Role-relevant shortcuts. Coaches get their squad; nutritionists also get the product library; admins and owners get the platform. Staff still see all the athlete cards above — coaches train too. |

Nothing is invented: an athlete with no synced sessions is told so and offered
the connect action, rather than shown zeros dressed up as achievement.

## The past-run debrief

The loop was only half closed: the platform could work out what a route demanded
and where the feeds belonged, but session logs were an *unconnected dataset* —
`SessionFeedback` had no link to an activity — so it could never answer the one
question an athlete asks after a bad run: **what should I have done differently?**

`SessionFeedback.activityId` joins the two, and `src/analysis/debrief.ts` reads
them together. The flow is one line, not a new screen:

1. **Home** counts the recent sessions with no log and asks about the oldest one
   first ("How did it go?"). *Your next move* points at the same session when one
   is waiting, so the headline advice and the mechanism agree.
2. **Connect** opens on that exact session (the route picker marks unreviewed
   ones with a quiet dot) and the debrief panel sits above the route's fuel plan.
3. Unlogged, the panel **asks** — gut, energy, carbs actually taken — rather than
   showing an empty state. The log is the missing input, so requesting it is the
   most useful thing that surface can do.
4. Logged, the same panel becomes the answer: what the route needed vs. what was
   taken, the gap, and findings that name the climb where the gap bit.
5. The route's own stop list below is **re-titled** "Where to take what, next
   time" and each stop names a real product (`Winforce Carbo Load · 60 g in
   500 ml`), chosen by the same `scoreForSlot` the planner uses. One list, not a
   second copy for the athlete to reconcile.

Two rules hold the reasoning honest:

- **No log, no verdict.** An invented one would be acted on, so an unlogged
  session reports *"Not enough to judge"* and no gap figure at all.
- **The gut comes first.** A severe-GI session is *gut-limited*, never
  *under-fuelled* — telling someone to eat more when their stomach was rejecting
  what went in is the one piece of advice that actively hurts.

## Sessions belong to one athlete

The activity store had no user dimension: every athlete's imported sessions went
into one pool and `GET /api/activities` returned all of them. It was invisible
while everyone saw the same demo data, and it surfaced the moment Home started
counting sessions — "29 sessions in the last 7 days" was several accounts' data
added together.

Activities are now keyed by **owner + activity id** (a provider id like
`strava:123` is only unique inside one account), and every athlete-facing read is
scoped to the signed-in principal. Platform-wide counts — health, admin overview
— still read across everyone, deliberately.

That exposed a second one: a provider's consent screen returns as a *top-level
navigation*, which carries no `Authorization` header, so the callback filed the
import under the demo persona instead of the athlete who started it. The OAuth
`state` is now minted by an authenticated `authorize-url` call, bound server-side
to that athlete, single-use and valid ten minutes — which is what `state` is for,
and keeps the session token out of URLs and server logs.
