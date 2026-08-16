# Changelog

Releases of the You Go Further platform. Individual modules carry their own
versions — see [`docs/modules.md`](docs/modules.md) for the rule and
[`src/version.ts`](src/version.ts) for the manifest. `GET /api/version` reports
both from a running deployment.

The platform version answers "which release is this?". A module version answers
"has this module's contract changed?". They move independently, on purpose.

## 0.19.0

**Changed**

- **One row shape, everywhere.** A session on Home, a product in the library, a
  service on Connect and a milestone on Insights are the same object — a
  leading mark, a name with a line under it, and something on the right — and
  each screen had invented its own. `Row` is that shape now; the screens supply
  what goes in it.
- **Insights: 3.5 → 2.7 screens.** Eleven milestones, each a title and a full
  sentence, made most of the screen a list of things the athlete had *not*
  done: nine hundred pixels of "not yet" under three ticks. What is earned
  stays in view; what is ahead is one line away, which is the right weight for
  a goal not yet reached.
- **Connect: 3.0 → 2.6 screens, and it stopped talking like a backend.** Each
  service was a card printing our own capability keys — `heartRate`,
  `trainingLoad` — and a note reading "Webhook + polling; ~600 reqs/15 min
  app-wide rate limit". That is our engineering, in our vocabulary, on the
  screen where an athlete links their watch. A service is now a row saying what
  it brings — "sessions · heart rate · power" — in the athlete's own language,
  in all four of them.

## 0.18.0

**Changed**

- **The phone screens were too long, and polish was never going to fix that.**
  Measured rather than argued about: the product library ran to 8 867 px — ten
  and a half phone screens of near-identical cards — the session plan to 4 395,
  the route to 4 357. The cause was the same everywhere: list and detail
  collapsed into one level, so every screen printed everything it knew at full
  depth.
  - **Product library: 10.5 → 3.6 screens.** Each card is now a disclosure
    whose summary is one row — thumbnail, brand, name, carbohydrate, price —
    with the macros, tags, usage note and buy button one tap inside. A closed
    card gets list spacing rather than card spacing, and the paragraph naming
    the brands moved below the list, where it costs nothing to skip. On a wide
    screen the disclosure starts open, so it is the same markup, not a second
    component to keep in step.
  - **Session plan: 5.2 → 1.7 screens.** Seven full panels stacked. Every one
    earns its place, but not all at once and not on a phone: the targets and
    the schedule are the answer, the products are how you get it, the energy
    curve and the log are what you look at afterwards. They are three sections
    on a phone now, opening on the answer, and a single page as before on a
    wide screen.
  - **Route plan: 5.2 → 4.4 screens.** The race forecast folds behind its own
    title. The height profile and its stop list stay — that is the answer, and
    trimming the answer is not a design improvement.

## 0.17.0

**Fixed**

- **The height profile could caption itself with a different distance from the
  session above it** — permanently, not for a frame. `parseProfile` measured
  the polyline we send to swisstopo, and a stored track is decimated while a
  generated one runs long: 51.6 km of line for a 29.2 km run in the case that
  caught it. The estimate path had honoured the recorded distance all along and
  said so in a comment; the swisstopo path did not, and this sandbox blocks
  swisstopo, so only a machine that could reach it ever saw the bug. Swisstopo
  supplies the shape of the ground, the athlete's watch supplies the length:
  the samples are now scaled onto the recorded distance, so every climb keeps
  its place and the axis agrees with the summary.

**Changed**

- **A figure and its unit are no longer the same size.** "129.7 km" set as one
  token makes the unit compete with the number; the unit is now smaller and
  muted, so the figure carries. Applied through the shared `Stat`, so it lands
  everywhere at once.
- **A change belongs to the figure it describes.** The week-on-week comparison
  was a pill in the card header, describing "this week" in general and leaving
  the reader to work out which of four numbers had moved — and on a tablet it
  wrapped the heading onto two lines to say it. It now sits under Hours, as
  "▼ 2.3 h on last week". The arrow is drawn, never coloured: in training more
  is not a synonym for better, and this component has no way to know which.
- The metric language reaches every screen that shows a figure, not only the
  ones rewritten first: the planner's targets, the race forecast, the coach
  dashboard, and the session rows on Home — where "11.6 km · 0:54 · ↑ 63 m"
  gave the middots the same weight as the numbers. The gap between a figure and
  its unit is a real space, because `innerText` is what a screen reader
  announces and what lands on the clipboard, and "129.7km" is not how anyone
  says it.
- **A sport is now a coloured disc**, not a grey mark that made every row in a
  list look the same. One palette keyed to the six sports the model actually
  has, with the shape still carrying the meaning so colour is reinforcement
  rather than the only signal.

**Added**

- **The training month**: five weeks as a dot grid, borrowed in form from a
  training calendar and carrying this platform's own question. Three states,
  not two — no session, a session, and a session the athlete logged — because
  the gap between the rings and the filled dots is exactly the gap between "we
  have your training" and "we can improve your fuelling". Weekday initials come
  from the locale, Monday first, and the grid says plainly what the ring days
  mean while any remain.

## 0.16.0

**Fixed**

- **The app told athletes their training was gone.** Waiting, empty and broken
  were one state: `activities` started as an empty array and a failed fetch was
  caught into an empty array two layers down, so a slow connection and a dead
  server both rendered *"No sessions yet. Connect a service and your training
  appears here."* On a train through the Gotthard, or during any outage, the
  first screen told an athlete their data was gone and asked them to redo the
  setup they had already done. Each state now says its own true thing: a
  skeleton while it comes, the empty state only once the platform has actually
  answered with nothing, and — when it did not answer — "we could not reach the
  platform, your training is safe", with a Try again that re-runs the load.
- **The sign-in form asked for a name and threw it away.** "Your name
  (optional)" was never sent, so accounts were named after the email's local
  part and the athlete was greeted "Good morning, n.brunner". The name now
  rides inside the signed magic-link token — the link is often opened in a
  different browser than the form was filled in — and the greeting drops the
  name entirely rather than reading out a machine string.
- **Sign-in errors were hard-coded English** on the one screen that carries a
  language picker, and were invisible to a screen reader. They are translated,
  announced with `role="alert"`, and tied to the field with `aria-describedby`
  and `aria-invalid`. The address is validated here rather than only at the
  server, so the refusal comes back in the language the athlete chose.
- **The overflow sheet had no way out but the scrim** — no escape at all on a
  keyboard, and a thin margin to hit on a phone. Escape closes it.
- **A session's summary and its height profile could disagree for a frame.**
  Effects run after React paints, so switching session drew one frame in which
  the summary already said 11.6 km while the chart still showed the previous
  route's 14 km. Brief, and exactly the kind of contradiction that makes an
  athlete stop trusting the numbers. The panel now resets during render when
  the route changes, so the stale frame cannot be drawn at all. Found by CI,
  which reads faster than a person and caught what six attempts here did not.
- **A tablet in portrait clipped its own navigation.** The tab strip scrolls
  horizontally when it runs out of room, and at 768 px it ran out — so an iPad
  showed "…Catalo" with nothing to suggest the bar could be swiped, and two
  destinations were effectively hidden. Measured across the range: the strip
  stops fitting at about 860 px, while the compact four-tabs-and-More layout
  only took over at 640 px, leaving a 220 px band of widths where navigation
  was broken. The compact layout now starts at 900 px, the account chip drops
  its name below that (the avatar already says who is signed in), and in the
  last sliver above the phone breakpoint the strip takes a row of its own.
  Verified at every width from 1440 down to 641: no collisions, nothing
  clipped.
- **Four figures broke 3 + 1 on a tablet**, orphaning "1939 m climbing" on a
  line of its own, and "129.7 km" was clipped inside its column. The week's
  card is never wide enough for four across — ~470 px even on a 1440 px screen
  — so it is two rows of two at every size.
- **A dialog dropped keyboard focus when it closed.** `autoFocus` on the
  confirm button is applied during mount, before the focus trap's effect runs,
  so the trap recorded the dialog's own button as "what was focused before"
  and restored focus to an element that no longer existed. Focus now returns to
  the control that opened the dialog — and the trap lands on Cancel first,
  which is the right default on a question about deleting an account.
- The journey carries a step that stalls the network and then breaks it, so
  the three states cannot silently collapse back into one. Its own injected
  500s are muted in the error collector for exactly as long as they are being
  injected — an assertion is not a defect, and a suite that cannot tell the
  difference is one that gets its filters widened until it stops noticing.
- **"By continuing you agree to our terms"** now links the terms when
  `TERMS_URL` is configured, instead of referring to a document with no way to
  read it.

## 0.15.0

**Added**

- **The athlete can take their data and leave.** `GET /api/me/export` returns
  everything the platform holds — account, body profile, activities, session
  logs, orders — and `DELETE /api/me` erases it along with the account.
  Neither is gated by tier: portability and erasure are rights, not upgrades.
  The export names the connected providers but never their tokens, because an
  export is a file people forward and a token is a live credential to somebody
  else's Strava. Paid orders survive deletion — bookkeeping law requires ten
  years — and the response says so rather than keeping them quietly.
- **Privacy & your data**, reachable from the account menu: what is held and
  why, the four things that leave the platform, the two buttons above, and who
  runs the deployment. The operator's identity comes from `OPERATOR_NAME`,
  `OPERATOR_ADDRESS`, `PRIVACY_CONTACT` and `TERMS_URL`, and an unconfigured
  build says outright that nobody is named instead of showing a placeholder.
- **An error boundary**, so a thrown error is a screen with a way back rather
  than a white page. It uses no translation lookup and no hooks, because it
  runs precisely when something else has failed. Unhandled promise rejections —
  a failed save in an event handler, which React's boundary never sees — are
  logged instead of vanishing.
- **An offline banner**, shown only in the build that has a server to be cut
  off from. The plan still computes in a valley; nothing syncs, and silence was
  the wrong way to say that.

**Changed**

- `preflight` blocks a production deployment that names nobody responsible for
  the data, and warns when the terms the sign-in screen refers to do not exist.
- `host-config.mjs` passes the operator's details to the browser. Setting them
  only in the server's environment would have passed preflight and still shown
  an unnamed controller, since the privacy screen runs client-side.
- The e2e journey ends with export, then deletion, then a fresh sign-in that
  proves the deletion — last, because the account does not survive it.

**Fixed**

- **CI was red on every push, and had been for a while.** The smoke suites
  pinned Chromium to this sandbox's fixed path, which does not exist on a
  runner — so the demo step could not launch a browser at all. All three
  suites now resolve a browser (`CHROME_PATH`, the sandbox, a system Chrome,
  or Playwright's own), and CI installs one.
- CI now runs the **full e2e journey against a real server**, not only the
  client-side demo. It is the suite that covers the most and it ran nowhere.
- The workflow's production fixtures name an operator, since preflight now
  refuses a deployment that does not.
- **An athlete's weight could revert on its own.** `saveProfile` writes the
  cache and returns before the server has the value; a screen mounting inside
  that window called `syncProfile`, read the *old* server profile and wrote it
  back over the new one. Nothing errored — the number simply changed back, and
  the faster the machine the more often it happened, which is why it showed up
  first on a CI runner and never here. Reads now queue behind writes, writes
  behind each other, and — the part that actually mattered — a read discards
  its answer if the athlete has written while it was in the air. Queueing alone
  never caught that one: by the time there is anything to queue behind, the GET
  has already left. Reproduced in a browser by holding the read open for three
  seconds, failing in both directions before and after, and the journey now
  carries that scenario as a step.
- **The production image could not start with the file store.** It runs as
  `node`, and `/app/.data` did not exist in the image — so Docker created it
  root-owned and the server died at start-up with `EACCES: mkdir /app/.data`.
  That is the path `docker compose up` and every "try it on a VM" instruction
  take. The directory is now created and owned by the runtime user. Nobody had
  noticed because the container check only runs after the test job, and the
  test job had been failing for other reasons.
- **A session outlived the account it named.** Tokens are stateless and signed,
  so deleting the athlete could not revoke one: their browser forgot it, but a
  copy kept anywhere else still verified, and an ingest with it would have
  filed fresh activities under the id of someone who asked to be erased. A
  request presenting a session for an account that no longer exists is now
  refused. The API-key surface is exempt — it presents a tenant's credential in
  the same header and has no account to check.

## 0.14.0

**Changed**

- **A panel stops being a box on a phone.** A 390 px screen has ~360 px of
  usable width, and it was spending a border, 32 px of panel padding and then
  another border on every card *inside* — so the content sat in a column
  narrower than the chrome around it, and a page of white boxes on grey read as
  a form. Top-level panels now give up their frame and separate by space and a
  heading, the way a page does. Things that are genuinely objects — the next
  move, the week's figures, a product — keep theirs.
- **The session planner shows the plan first.** On a wide screen the inputs are
  a sticky column beside the answer; stacked on a phone they were five controls
  and a screen and a half of scrolling *before* the first number, and changing
  one meant scrolling back past the answer. The form is folded behind a summary
  line — "1 h 30 min · Running · Moderate · Temperate — Adjust" — so the page
  opens on the plan. The screen is 24% shorter and its first view is the four
  targets rather than a form.
- **Recent sessions are cards, not rows.** Each carries the sport's own shape,
  so a run is findable among three identical lines, and the debrief link now
  looks like the primary action instead of one of six identical blue links.
- **The catalogue starts at its products.** Six rows of chrome preceded the
  first one, with the count printed twice; the intro folds, the duplicate count
  is gone, and the filter and sort rows scroll sideways instead of wrapping onto
  four lines. Cards are denser: 354 px → 328 px, so the page went from ~11
  screens to ~10 and shows nearly two products at a time.
- **The greeting gets the hero back.** Readiness was the largest thing on the
  screen and pushed "Good afternoon, Nina" onto two lines; it is a compact chip
  beside the streak now.
- Tap feedback on every control, since a touch screen has no hover to fall back
  on.

**Fixed**

- **Half the mobile stylesheet was dead.** Its `@media` block sat *above* the
  rules it meant to override, and CSS breaks a specificity tie by document
  order — so those rules silently lost. The phone refinements now live at the
  end of the file, where they can win, and the ones that had never applied do
  now.
- The weekly fuelling summary read "4 of 4 sessionsneed in-session fuel" — a
  missing space between two translated fragments.

## 0.13.1

**Fixed**

- **The demo did not work.** On the client-side build — the one a static host
  serves and the one "explore a demo account" opens — every screen asked an API
  that was not there, caught the error and rendered an empty state. Home showed
  no sessions, Insights had nothing to analyse, and Plan → *A route* fell
  through to the GPX importer because the athlete appeared to have no routes.
- **Connections were forgotten the moment you left the screen.** Connect had a
  local fallback of its own, so linking a provider *looked* like it worked —
  the connection lived in React state and nowhere else, so navigating away lost
  it and a reload lost it again.

Both were one missing piece: the client-side build had no store for connections
or sessions. `src/api/trainingData.ts` is that store — connections in
`sessionStorage`, sessions rebuilt through the same ingestion pipeline the
server uses. Every screen now asks it the same question instead of each
answering for itself, so Home, Insights, Connect and the route screen agree on
one set of sessions with one set of ids — which is what makes "How did it go?"
open the run it names.

`sessionStorage` rather than `localStorage` on purpose: a demo is a sitting, and
a demo world that outlives the tab becomes stale data pretending to be an
account. Inside the tab it survives navigation and reloads.

**Added**

- `npm run e2e:demo` — the demo journey against the server-less build. The
  existing e2e runs against the Node server, so this path had no coverage at
  all; the new suite fails eight of its nine steps on the previous build and
  passes on this one, and CI runs it on every push.

## 0.13.0

**Changed**

- **The guide is a section of its own, and reads like one.** Sixteen articles of
  real editorial work were a collapsed accordion three panels down the Insights
  screen. They now have their own tab: a masthead, a search box, topic filters
  and a card grid — and an article you open gets the whole width, one column at
  a readable measure, its key numbers first. An index and an article are
  different screens, so they stopped being the same one.
- **The product library is a shop.** Search across brand, name, category and
  notes; sort by name, price or carbohydrate; and a card grid with a mark on
  every product instead of a wall of text rows. The marks are **drawn, not
  photographed** — a category silhouette and the brand's initials. We hold no
  product photography, and a stock photo of "a gel" attached to a named product
  would make every real number on the card less believable.
- **Four tabs and a "More" on a phone.** Seven navigation targets do not fit
  across 390 px, and the bar was already scrolling sideways. Home, Plan,
  Insights and Catalog stay in the bar; the rest are one tap away in a sheet.
  Tablets and desktops show the whole set, as before — the markup differs by
  viewport rather than being rendered twice and hidden.

**Added**

- `useMediaQuery`, for the handful of places where the markup itself has to
  change shape rather than just its appearance.

**Verified**

- Every screen at 1440, 1024, 834, 768 and 390 px: nothing reaches past the
  viewport unclipped at any of them. The e2e journey now walks the phone-width
  sweep *through* the More menu, so the screens behind it are checked too.

## 0.12.0

**Changed**

- **A route is not a setting, so it left Connect.** The map, the height profile
  and the fuelling stops were three panels below the provider cards on the
  screen you open to link Strava. They are now Plan → *A route*, beside the race
  and the session — with your own recorded routes and an imported GPX as two
  sources of one view rather than two features. "How did it go?" on the start
  screen lands there too, which is where the debrief already lived.

**Added**

- **A layer switcher on the map**, collapsed to one button in the corner the way
  every map does it. Base maps as a radio group — national map, aerial, muted,
  OpenStreetMap — and the federal overlays stacked on top as checkboxes: marked
  hiking trails, signed cycle routes, ground over 30°. An overlay whose tiles
  the service will not serve switches itself off and says so, rather than
  looking like a tick that does nothing.
- **The height profile and the map share one cursor.** Point at a climb on the
  profile and it is marked on the map; move along the track on the map and the
  profile follows, with a readout of distance, altitude and gradient. "Where is
  that climb, actually?" was work the athlete was doing by eye.

**Fixed**

- **The height profile was drawn from the wrong data.** It plotted the fuelling
  *segments* — the handful of units the engine reasons in — so a marathon was a
  dozen straight lines. It now draws the elevation samples themselves, which is
  the measurement, at whatever resolution swisstopo returned.
- **And it was stretched.** A fixed 320×96 viewBox scaled to the panel width
  with `preserveAspectRatio="none"`, so every gradient on screen misreported its
  own steepness. It is measured and drawn at real pixel size, and the vertical
  exaggeration is now stated (×70 on a flat route) rather than silently applied.
- **It had no scale at all** — no altitude gridlines, no distance ticks. A
  picture with no numbers on it.
- **The layer control could not be opened with a mouse.** Opening on hover and
  toggling on click meant the hover opened it and the click that followed closed
  it again. Click-only now.

## 0.11.0

**Added**

- **This runs on Swiss infrastructure now**, and the documentation says exactly
  what that does and does not mean. `docs/hosting-switzerland.md` covers three
  deployment shapes — one instance, managed Kubernetes, managed Node — on
  Infomaniak or any of the Swiss alternatives, plus a table of what still leaves
  the country (Strava and Garmin, unavoidably; Stripe, Databricks, map tiles and
  the mail provider, all optional) and a go-live checklist.
- **`npm run preflight`** — the settings that are safe in development and wrong
  in production, written down and executable: the signing key that ships in this
  repository, the in-memory store, the demo role switcher (which the API honours
  as an unauthenticated admin login), a plaintext SMTP password, a Stripe key
  with no webhook secret. Rules are unit-tested, run by CI, and **run by the
  server itself at start-up** — a misconfigured production container now exits
  instead of coming up looking healthy.
- **`npm run verify:deploy`** — the same question asked of a *running*
  deployment over HTTP, because a config file and the container actually running
  are not always the same generation. Checks security headers, HSTS and the
  HTTP→HTTPS redirect, that `config.js` is uncached and hashed assets are not,
  that `/v1` refuses an unauthenticated call, and that `x-role: admin` is
  refused — against an endpoint that provably tells the two states apart.
- **An SMTP mailer**, no dependency: implicit TLS or STARTTLS, AUTH PLAIN and
  LOGIN, header-injection and dot-stuffing handled, tested against a real socket.
  Sign-in mail can go through a Swiss mailbox instead of a foreign HTTP API.
- **A production container image.** One origin (SPA + API in one process), built
  in stages so no build tooling ships, non-root under `tini` so SIGTERM reaches
  the new graceful shutdown, configured at start rather than at build so one tag
  is promoted from staging to production instead of rebuilt.
- **Deployment manifests** under `deploy/`: a Compose stack with Caddy for
  automatic Let's Encrypt TLS, Kubernetes manifests with probes that tell
  "stuck" apart from "cannot reach the database", an annotated `env.example`,
  and Postgres backup and *restore-check* scripts — the second because an
  untested backup is a belief.

**Fixed**

- **The security headers were never applied to the deployment that matters.**
  They lived in `nginx.conf`, and the single-origin deploy serves the SPA from
  the Node process with nginx nowhere in the path — so production shipped with
  no `X-Content-Type-Options`, no framing policy and no HSTS. They are set in
  the server now, covering both surfaces, with HSTS withheld until a request has
  actually arrived over TLS.
- **Static files were served with no cache headers at all** by that same path:
  fingerprinted assets re-downloaded on every visit, and `config.js` — which is
  how a deployment is reconfigured without a rebuild — cacheable, so a
  configuration change could appear to do nothing.
- **SIGTERM killed in-flight requests.** The server now stops accepting
  connections, finishes what it is serving, and exits — which is what makes a
  rolling deploy invisible instead of a scatter of failed requests.
- **CORS answered every origin.** `ALLOWED_ORIGINS` narrows it; unset, the
  single-origin behaviour is unchanged.

## 0.10.3

**Fixed**

- **Choices were hidden inside dropdowns.** A native `<select>` shows one option
  and hides the rest behind an OS menu, which is the wrong control for a choice
  between three and twelve things worth comparing. Goal, activity, intensity,
  conditions, sweat level, race, product category and both session ratings are
  now visible groups: chips for short labels, cards for options that need a
  sentence. Each is a real radio group — one tab stop, arrow keys move the
  selection — and each carries an icon.
- **The goal picker was cutting off its own explanation.** "Endurance
  performance — Go longer and faster" arrived as a truncated dropdown line. The
  sentence that tells two goals apart is the whole reason it was written, and it
  is now shown in full beside each option.
- **Picking a race meant opening a menu of twelve.** The race list is a list:
  name, date, distance and climb for each, all on screen.
- **German was being cut off the right edge of a phone.** Equal-column control
  rows sized their track to their content, so "Locker / Mittel / Hart /
  Wettkampf" pushed its whole column past the viewport — and because the page
  clips sideways overflow, the last option was simply chopped in half with
  nothing to scroll to. The rows flow now, the layout column can shrink, and
  `npm run e2e` walks every screen at 390 px in German to keep it that way.

**Changed**

- **Long text folds.** The training-plan preamble, the race-day advice and the
  plan's learnings clip to their first lines with a "Show more" that appears
  only when there is genuinely more; the text is clipped by CSS, never removed,
  so find-in-page and screen readers still reach all of it.
- **The build shows one week at a time.** Every week of a fifteen-week plan
  expanded at once made it a page you scroll for a minute. Each week keeps the
  four facts that let you find it — which one, what it is for, how much, how far
  out — and opens on a tap. This week starts open.

## 0.10.2

**Fixed**

- **The type was too small to read on a phone.** Measured at 390 px, roughly
  three quarters of the visible text was under 14 px — 148 of 188 nodes on the
  insights screen, 34 of them at 10 px. The *tokens* now scale up below 720 px
  rather than components being patched one at a time, so the whole interface
  moves together: the insights screen is down to 56 nodes under 14 px and the
  floor is 12 px.
- **Nothing but words.** Every navigation target, mode and action had the same
  shape and weight as the prose around it. There is now an inline SVG icon set —
  no icon font, no network round trip — on the navigation bar and the plan
  chooser, so a target can be found without reading the row.
- **Touch targets under the 44 px minimum**: the health chips were 35 px, and
  the insights screen had nine controls below the line. Two remain, both text
  links inside paragraphs, which grow their hit area with padding instead.
- **The plan chooser filled half a phone screen** — three stacked cards, about
  400 px of an 844 px viewport before any content. It is a compact row of three
  on a phone, which is what a chooser should be.

## 0.10.1

**Fixed**

- **The Plan screen did three jobs at once.** A named race, a GPX import and the
  session planner were stacked on one page: 6.7 screens deep, 13 panels, 53
  controls. They are three different questions and an athlete arrives with one
  of them, so the screen now asks which — a race, a route, or a session — and
  shows that one. The race view is 1.1 screens with 8 controls. Home's "Plan a
  session" and "Plan a race" buttons, which already existed and both landed on
  the same wall, now land on the right one.
- **The race panel stacked race day and the build.** Nine weeks out an athlete
  wants the plan; on the Thursday before they want what to carry. Those are now
  two views rather than four screens of scrolling.

## 0.10.0

**Added**

- **Every session of a race build now carries its own fuelling** — before,
  during and after — computed by the same engine the session planner uses,
  because a second dosing model living in the training module would eventually
  disagree with the first and the athlete would be told two things. The one
  exception is the during-rate on a long day, which the plan owns: that is the
  gut-training progression and it is deliberately below what today alone would
  need in the early weeks.
- **Preparation statistics**: how many sessions the build asks for, how many
  rehearse the full race rate, the week that rate is first reached, the longest
  rehearsal, and the carbohydrate to be practised across the whole plan.
- **Learnings from the athlete's own data.** A gut ceiling their logs have
  demonstrated overrides the rate the race arithmetic wants — telling somebody
  whose sessions show distress at 60 g/h to aim for 90 is how a plan loses an
  athlete. With no logs at all the first item asks for one rather than
  inventing an insight.

## 0.9.1

Fuelling now changes your level, and not by the same amount every time.

**Fixed**

- **The curve rose after a feed, like a battery charging.** Exogenous
  carbohydrate is burned *instead of* glycogen — it spares the store, it does
  not refill it, because muscle glycogen is not resynthesised at any meaningful
  rate during exercise. Fuelling now changes the slope and never the direction:
  the line flattens to horizontal when intake matches burn, and never climbs.
  Delivery is also capped by what is actually being burned, so carbohydrate
  that is not needed queues in the gut instead of vanishing into a tank.
- **Every feed was the same size at the same interval, right to the finish.**
  Both ends of that are wrong. Carbohydrate takes about a quarter of an hour to
  reach the blood, so a gel at minute 235 of a four-hour run is swallowed,
  carried and finished with — feeding now stops early enough to be used, and
  those grams are redistributed rather than dropped, so the session total still
  meets the target. And early grams are worth more than late ones — a gram that
  spares glycogen at minute 30 is still in the tank at minute 200 — so the doses
  lean forward gently rather than sitting flat.

The two together mean timing is now worth something. The same 300 g across the
same four-hour session finishes at 70 % in reserve taken early, 36 % dumped
late, and 13 % if it is swallowed in the last eight minutes — where 3 g of it
arrives before the line.

## 0.9.0

The two halves of preparing for a race: knowing what the fuelling actually does
to you, and having a plan to get there.

**Added**

- **`src/training`** (0.1.0). A periodised plan for a named race. Picking a race
  and being handed only a fuelling plan answers the last question first — the
  athlete's problem between now and September is the training. Volume is built
  from *their own* recent weekly hours, rises about 8 % a week with every fourth
  week cut back, tapers off the peak the build actually reached, and the
  carbohydrate rate on the long day climbs to race rate during the
  specific-preparation weeks so it is rehearsed on tired legs rather than met
  for the first time on the day. An ultra gets back-to-back weekends instead of
  one heroic long run; a climbing race gets hills where a flat one gets
  threshold work.

**Fixed**

- **The energy curve was two straight lines.** Burn was a constant and intake a
  constant subtracted from it, so the feed pins along the top of the chart
  floated above a picture they had no effect on — you could move every gel and
  nothing moved. Feeds are now events absorbed over a quarter of an hour, the
  gut has a ceiling (a 105 g/h plan does not offset 105 g/h of burn; over a
  14-hour race that is 1435 g swallowed against 1208 g absorbed), carbohydrate
  oxidation falls as the store empties, and "race" intensity is discounted for
  how long it has to be held — 202 g/h became 147 g/h for an Ironman. The chart
  can now reach a verdict it was structurally incapable of: that even a maximal
  plan will not hold the tank up, and the athlete should go easier early.
- **Two burn models disagreed.** The chart used one table and the race
  simulation another, so the same athlete on the same session could get two
  answers. There is one now.

## 0.8.0

Two things that were quietly hand-maintained: the race calendar, and the demo.

**Added**

- **`npm run refresh:events`.** The race dates were curated by hand and flagged
  approximate, which is honest but is not an answer — an athlete tapering for
  the wrong Saturday has still been failed. Most organisers already publish the
  real date as schema.org `SportsEvent` markup (the data that puts a race in
  Google's event results) or an `.ics` feed, so `src/events/sync.ts` reads
  those and the script writes what it finds into a generated `confirmed.ts`.
  A confirmed date is the only thing that clears `dateApproximate`, and it
  carries the URL and timestamp it came from.

  The parsing is the easy half. The half that matters is **refusing**: a
  fetched wrong date is worse than a curated approximate one, because the
  approximate one is labelled and the athlete checks it. A candidate needs a
  date that parses, is in the future and inside eighteen months; a name sharing
  a *distinctive* token with the race (an early version scored
  "Jungfrau-Marathon" against "Zürich Marathon" at 0.5 on the word "marathon"
  alone — above the accept threshold — so one page about the wrong race could
  have confirmed a date); and no tie, so an organiser page listing E101, E51
  and E35 cannot give one sibling another's date. Everything else stays
  approximate and the script reports which and why.

- **A demo account that is an account.** "Explore a demo account" landed on an
  empty Home — no sessions, no week, no insights, no fuelling score — because a
  demo persona has no connected provider. It now arrives connected, through the
  same OAuth path the onboarding button uses, and with three session logs so
  the half of the product that learns from outcomes has something to show. The
  personas are people now, with their own body profiles, so the plans on screen
  are somebody's rather than the 70 kg default.

**Fixed**

- **The demo's training history reset on every render.** The sample generator
  seeded from the sync window's start — a millisecond-precision timestamp — so
  three calls a millisecond apart returned 19, 21 and 14 sessions, 502 km, 586
  km and 376 km, with no activity ids in common. `externalId` was that same
  millisecond, so the same run synced twice was two different activities and
  deduplication could never match. Sessions are now keyed on the calendar day
  they happened.
- **A week that looked nothing like a week.** Sessions were drawn one per day
  at random: no rest days, no weekend long run, no build/recovery rhythm —
  noise that the acute:chronic ratio and the form curve then analysed. There
  are now two rest days, quality separated by easy running, the long day at the
  weekend, and a recovery week every fourth week, with intensity showing up in
  the pace and heart rate.
- **Signing in always landed on Plan, not Home.** Signed out, `visibleTabs` is
  empty, so the tab-correction effect "corrected" the default before anyone had
  signed in. Onboarding masked it by setting the tab at the end.
- **Two of the five demo chips both read "Athlete"** — they were labelled by
  role, and the solo and club athletes are the two most different accounts here.
- **Session names ignored the sport**, putting "Progression run" on a 68.9 km
  session at 26 km/h, and every athlete drew a fresh Swiss trailhead per
  session, so one person trained in Zürich on Tuesday and Zermatt on Wednesday.

## 0.7.0

Named races. Until now every plan started from a course or a session — a shape
and a duration. An athlete does not arrive with a shape; they arrive with "the
Jungfrau-Marathon is in nine weeks", and almost everything useful follows from
the date rather than the distance.

**Added**

- **`src/events`** (0.1.0). A curated list of twelve Swiss endurance races, the
  countdown phases that decide what to eat *this week* rather than in general
  (`base` → `build` → `taper` → `raceWeek` → `raceDay`), aid-station carry legs,
  and a readiness check against the athlete's own longest recent session.
- **A race-day forecast that goes live as the date comes into range.** Beyond
  the sixteen-day model horizon the plan runs on climatology and says so; inside
  it, the plan changes when the real forecast does. It covers the *hours of the
  race*, not the calendar day — a 09:00 marathon has its field on the steepest
  climb at the hottest hour, and the daily mean hides exactly that.
- **`GET /v1/events` and `POST /v1/events/{id}/plan`** on the public contract
  (now 1.1.0, additive). `dateApproximate`, `aidStationsKnown`,
  `weather.forecast` and `weather.estimateReason` are fields rather than
  footnotes: a partner has to destructure past our uncertainty to render it.
- **Event planning in the app**, in all four languages, above the GPX importer.

**Fixed**

- **Two altitude corrections stacked on one temperature.** `estimateWeather()`
  used latitude as a stand-in for altitude; the event forecast then applied a
  real lapse rate on top of it. Sierre-Zinal in August came out at 6 °C, which
  would have argued an athlete out of the fluid they needed on a hot valley
  race. `estimateWeather()` now takes an optional real altitude and applies one
  correction with a physical meaning; the altitude-free path is unchanged.
- **"Check back in 0 days."** A seasonal average was shown with the same words
  whether the race was too far out for a forecast or the model was simply
  unreachable. Those resolve differently — one with time, one with a connection
  — and `estimateReason` now distinguishes them everywhere, including on `/v1`.
- **A colour-only distinction in the carry table.** Which legs an athlete has to
  be self-sufficient on is the most useful thing in it, and it was carried by a
  red edge alone. It is now said in words as well.
- **`Spitze Bei 10°C`.** The weather block's labels inherited a
  `text-transform: capitalize` written for one-word labels, which upper-cases
  every word of a phrase — in German that reads as a typo.

## 0.6.0

API hardening. Four defects that only show up under load or under attack, none
of them visible from a passing test suite.

**Fixed**

- **Unbounded request bodies.** Both transports streamed a POST body into memory
  with no ceiling — one request could exhaust the process. Capped at 1 MB, well
  above the largest legitimate payload (an elevation profile), with a 413. The
  first attempt at this was itself wrong: destroying the socket before flushing
  the response meant the client saw only an interim `100 Continue` and a dead
  connection, indistinguishable from a crash. Verified over real HTTP, with and
  without `Expect: 100-continue`.
- **500 responses handed out internal failure text.** `e.message` carries
  whatever the failure happened to say: a Postgres error carries the query and
  the host, a filesystem error a path. The caller now gets `internal_error` and a
  reference; the detail goes to the log tagged with the same reference, so a
  support question stays answerable.
- **The sign-in endpoint was a membership oracle.** Answering "registration is
  closed" only to unknown addresses let anyone type an email and learn whether
  that person has an account. The reply is now identical either way — the only
  difference is whether mail arrives, which only the address's owner can see.
- **No rate limit anywhere on `/api/*`.** Asking for a sign-in link sends real
  mail to an address the caller chose, so unlimited it is a way to flood a
  stranger's inbox on our sending reputation. Now limited — and limited by
  **inbox**, not by source address: a first attempt keyed on IP was caught by the
  e2e starving its own sign-in, which is exactly what a university, a company or
  a mobile carrier behind one NAT would have experienced. Three per address per
  minute, thirty per source. Ingest and checkout are limited per athlete.

**Added**

- `ApiResponse.headers`, so the router can set `Retry-After` — the number was
  already in the 429 body, where no HTTP client, proxy or CDN looks for it. Both
  the app API and `/v1` now send it.
- `ApiRequest.clientIp`, resolved by each transport. `x-forwarded-for` is trusted
  only when `TRUST_PROXY=true`, because a client can set that header itself and
  trusting it blindly hands every attacker a fresh bucket per request — worse
  than no limit, because it looks like protection.

630 unit tests, 43 e2e steps and the mobile parity smoke pass.

## 0.5.0

Import, tested against each provider's own payload shape instead of against our
idea of it. Ten defects found, every one of which would have corrupted or lost
real athlete data on the first live sync.

**What could not be tested.** No call was made to a live Strava, Garmin, Polar or
Suunto API. This environment blocks every provider host, and a live check also
needs a registered developer application per provider and a real athlete's OAuth
consent. `npm run verify:providers` is the script that does that run wherever
those exist; it reports a provider with no token as **skipped, not passed**. See
`docs/provider-import.md`.

**Fixed — import**

- **Garmin returned every session as sport "other" and dated today.** The
  normaliser read only the internal web API's `{ typeKey }` and `startTimeGMT`,
  while the official Health API sends a string `activityType` and
  `startTimeInSeconds`. Both shapes are read now, and the epoch is already UTC so
  the local offset is not added to it. Ascent was dropped for the same reason
  (`totalElevationGainInMeters`).
- **Polar sessions landed in the wrong timezone.** `start-time` is local wall
  clock with the zone in a separate `start-time-utc-offset`, so parsing the
  string alone made the runtime guess — a Swiss athlete's summer sessions came
  out two hours off, some on the wrong day. Polar's own `training-load` was also
  discarded and then recomputed, worse, from averages.
- **Suunto heart rates were in hertz.** An average of 2.6 does not throw; it
  quietly ruins every intensity inference, training load and fuelling target
  downstream. Suunto's numeric sport enum was also unread, so every workout was
  "other".
- **Strava truncated at 100 activities and never refreshed its token.** A backfill
  silently lost everything past the first page, which looks exactly like "they
  did not train much"; and since an access token lasts six hours, the first sync
  of the day worked and every one after it failed with a 401. Both fixed, plus a
  429 now returns a partial sync rather than throwing the whole thing away.

**Fixed — sample data**

Speed was drawn independently of duration, producing a 3.5-hour run at 4:24/km
over 48 km and a 100 km Swiss ride with 254 m of climbing — in the data the demo,
the screenshots and every e2e run are judged on. Pace now decays with duration,
ascent is Swiss and scales with distance, a swim stays a swim, and some sessions
have no GPS at all, because real weeks have them and the app has to meet one.

**Added**

- `src/providers/fixtures.ts` — representative payloads in each service's own
  shape, including the traps above.
- `src/providers/import.test.ts` — normalisation, units, dedup, pagination, token
  refresh and rate-limit handling. Assertions pin physiological plausibility, not
  just types.
- `scripts/verify-providers.mjs` / `npm run verify:providers`.
- `docs/provider-import.md` — what is verified, what is not, and why.

## 0.4.0

The engine stops being only our app's engine: a versioned public contract that
somebody else can build against.

**Added**

- **`/v1` — the public engine API** (`src/api/publicApi.ts`). Deliberately a
  separate surface from `/api/*`: our own app's routes may change whenever the
  app does, but `/v1` is somebody else's dependency, with its own
  `CONTRACT_VERSION`, its own flattened response shapes, and golden tests that
  fail if a field disappears — because on the other side of it is watch firmware
  nobody can hotfix. Six endpoints: `plan`, `course`, `absorption`, `heat`,
  `catalog`, `meta`. Every response, including every error, is stamped with the
  contract, engine and platform versions.
- **Per-tenant API keys** (`src/api/apiKeys.ts`). Only a SHA-256 hash is stored,
  so a leaked database hands over nothing usable; the plaintext is returned once
  and the response says so. Scoped (`plan`, `course`, `catalog`, `cohort`),
  revocable without a deploy, and compared in constant time. `ygf_live_` in
  production, `ygf_test_` everywhere else.
- **Rate limiting and usage metering** (`src/api/rateLimit.ts`). A token bucket
  rather than a fixed window, which a caller can straddle to spend twice the
  limit at the moment it matters. Usage is counted per key, per endpoint, per day
  — aggregate only, because answering "how many calls" never requires holding a
  partner's athletes' body data.
- **Key administration** behind `org:configure`: issue, list with usage, revoke.

**Why it exists.** The vision names this exactly: Phase 6 says the engine, not
the app, is the product, and that a licensing conversation needs versioning, a
stable contract, rate limiting and per-tenant keys. Versioning landed in 0.3.0;
this is the other three. Phase 2 needs the same thing sooner — a Garmin Connect
IQ app is a third-party client calling the engine over HTTP, and `/v1/plan`
already returns the flat, ordered cue list a watch counts down to.

**Fixed**

- **Privilege escalation on both deployments.** The transports honoured the
  `x-role` demo header unconditionally, so an unauthenticated request carrying
  `x-role: admin` became an org admin — `allowRoleSwitching` gated the UI's role
  picker and nothing else. It now gates the header too. Found while wiring the
  owner-only key endpoint, whose gate it would have bypassed.
- **The Vercel adapter never passed request headers to the router**, so every
  `/v1` call would have looked unauthenticated on that deployment while working
  on the other — the exact drift a shared router exists to prevent. It also now
  forwards the raw body, which payment-webhook signature verification needs.
- `/v1` reached the router on neither deployment: the Node server only forwarded
  `/api/`, so the SPA fallback answered an unauthenticated keyed endpoint with
  **200 and a page**. Vercel needed a rewrite, which delivers the path as
  `/api/v1/...`, so the router normalises both forms and a test pins that the two
  return identical answers.
- `planRouteFuelling`'s catalog was not threaded through the course endpoint, so
  a tenant with their own product library would have got our products named in
  their stops.

## 0.3.0

The release that made the platform describable: every module versioned,
documented and reported by the running server.

**Added**

- **Version manifest** (`src/version.ts`): a per-module version, layer,
  stability label and public API for all 25 modules, plus the platform version.
  `package.json` and the runtime config now read the platform version from here
  instead of each carrying their own copy — before this, the repository claimed
  `0.1.0` in one place and `0.2.0` in another.
- **`GET /api/version`** — what is actually deployed, module by module.
- **Documentation**: [`docs/modules.md`](docs/modules.md) (every module: what it
  owns, what may be imported from it, and why anything less than stable is less
  than stable) and [`docs/engine.md`](docs/engine.md) (the engine file by file).
- **Manifest tests** (`src/version.test.ts`): a module cannot be added to `src/`
  without being versioned and documented, a `preview` label must state what is
  missing, and the `domain` layer is checked to be free of React, `fetch` and
  `localStorage` — the property that lets the engine run unchanged in a test, a
  browser, a server and an edge function.

**Engine — 1.1.0 → 1.2.0**

- **Heat strain** (`heatStrain.ts`): apparent temperature via the Rothfusz heat
  index, sweat rate from intensity × body mass with a humidity penalty where
  evaporation starts failing, sodium loss at that rate, and the rise in glycogen
  use in the heat, capped at +25 %. A measured sweat rate or sweat sodium always
  overrides the model and says which was used.
- **Race simulation** (`simulate.ts`): the route walked segment by segment with
  carbohydrate, fluid, sodium and time tracked against the athlete's own store.
  Runs the course twice — with the plan and on water alone — and names the
  kilometre where each crosses the fade line.

**Interface — components 1.1.0 → 1.2.0, i18n 1.0.0 → 1.1.0**

- The **race forecast** card: both curves against the fade line, the four figures
  behind them, and any warnings, in all four languages. Warnings carry their
  numbers as well as their English sentence, so each locale writes its own.

**Fixed**

- Legend colour swatches were scoped to the energy strip, leaving the
  fitness/fatigue legend as two words with no way to tell which curve was which.
- The bonk marker was an SVG circle in a non-uniformly scaled plot, drawn as an
  ellipse — wider on a desktop than on a phone.
- The forecast headline and its first warning stated the same thing twice.
- Reported kilometres carried a decimal, implying a precision the model does not
  have.

## 0.2.0

Phase 1 unblocked: the free Swiss app, earning through affiliate commission
rather than subscriptions.

- Subscriptions and direct sale switched off behind `subscriptionsEnabled` and
  `sellDirect`; every tier serves the full feature set.
- Affiliate hand-off to partner shops, with honest labelling when no programme
  is signed.
- Race import from GPX, and a fuelling plan for a course never run before.
- Absorption ceilings, training load analytics, and anonymous cross-athlete
  cohort learning.
- The past-run debrief, French and Italian dictionaries, and the start screen.

## 0.1.0

The first working platform: engine, connectors, activity pipeline, planner,
insights, catalog, auth, and the Node and Vercel deployments sharing one router.

---

## Why the platform is not 1.0.0

Three things are interfaces with a documented stand-in behind them, and the
platform reaches 1.0.0 when they are real:

- **Connectors** (`src/providers`, 0.6.0) — authorisation URLs and scopes are the
  real ones; token exchange and live API calls are the next step.
- **Payments** (`src/commerce`, 0.8.0) — implemented and unit-tested, not yet
  verified against a live Stripe test-mode account.
- **On-device health** (`src/health`, 0.9.0; `mobile`, 0.7.0) — normalisation is
  real and tested, but native HealthKit and Health Connect reads need a physical
  device.

Modules that *are* settled carry 1.x versions today. That is the point of
versioning them separately: the engine's contract does not become provisional
because a connector's is.
