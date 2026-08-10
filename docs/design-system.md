# Design system

One token set, one look. Every colour, space, radius, type size, elevation and
motion value in the app resolves to a **token** defined once in the `:root` block
of `src/styles.css`. Components reference tokens — never raw hex/px — so the whole
surface stays harmonized and a theme change is a one-line edit.

## Tokens

### Colour — surfaces (low → high elevation)
| Token | Use |
| --- | --- |
| `--bg` | app background |
| `--surface-inset` | wells / inputs sunk into a panel |
| `--panel` | card & panel surface |
| `--surface-3` | alternate raised surface |
| `--panel-2` | raised inner surface (chips, nested cards) |
| `--border` / `--border-strong` | hairlines / emphasised borders |

### Colour — text & brand
| Token | Use |
| --- | --- |
| `--text` / `--muted` | primary / secondary text |
| `--on-accent` | text on a filled accent or phase colour |
| `--accent` / `--accent-soft` | Swiss red — primary action & danger |
| `--info` `--warn` `--success` | semantic status |
| `--pre` `--during` `--post` | session-phase aliases of info/warn/success |
| `--accent-purple` | accent for gamification/achievements |

### Radius
`--radius-xs` (6, tags) · `--radius-sm` (8, buttons/fields) · `--radius-md`
(11, cards) · `--radius-lg` (14, panels) · `--radius-pill`. `--radius` aliases
`--radius-lg` for back-compat.

### Spacing (4px base)
`--space-1`…`--space-10` = 4, 6, 8, 10, 12, 14, 16, 20, 24, 32 px. Use for
padding, gaps and margins.

### Type
`--text-2xs`…`--text-4xl` = 10, 11, 12, 13, 14, 15, 17, 22, 26, 30 px. Body text
is `--text-md`/`--text-base`; labels `--text-sm`; stats & headings `--text-2xl`+.

### Elevation & motion
`--shadow-sm` `--shadow-md` `--shadow-lg`; `--transition` (0.15s ease).

## Light and dark

Both themes are the *same* design: only the colour tokens change — spacing,
type, radius and motion are shared. Dark is the default; light is a token
override on `:root[data-theme="light"]`.

* `useTheme()` (`src/theme/`) resolves **system | light | dark**, persists the
  choice, and puts the result on `<html data-theme>`. On "system" it keeps
  listening, so a phone that switches at dusk switches the app too.
* It also sets `color-scheme` — without that, native scrollbars and form
  controls stay dark on a light page and the whole thing looks broken — and
  updates `<meta name="theme-color">` so the browser chrome matches.
* A `prefers-color-scheme` block covers first paint, before any JS runs, so a
  light-mode device never flashes dark.

### Ink tokens

A colour that reads well as a **fill** is often illegible as **text**. Every
semantic colour therefore has an `--*-ink` variant used for text:

| Fill | Text |
| --- | --- |
| `--accent`, `--info`, `--warn`, `--success`, `--accent-purple` | `--accent-ink`, `--info-ink`, `--warn-ink`, `--success-ink`, `--accent-purple-ink` |

In light mode each one is darkened until it carries at least **4.5:1** on a white
panel — amber especially, which is unreadable at its pill brightness. In dark
mode most inks are an alias of the vivid colour, with one exception: the Swiss
red `#e4002b` carries only **3.51:1** on the dark panel, so `--accent-ink` is a
lightened `#ff5c72` there. A fully saturated red cannot be lightened without
moving toward pink; that is the trade, and it applies to text only. Fills,
borders, buttons and pills keep `--accent`, so the brand red is still the brand
red wherever it is a shape rather than a word.

Use the vivid token for fills, borders and pills; use ink whenever the colour is
the text.

### Tint tokens

Tints are **mixed from the semantic colour**, never written out:

```css
--warn-line: color-mix(in srgb, var(--warn) 40%, transparent);  /* a border  */
--warn-soft: color-mix(in srgb, var(--warn) 12%, transparent);  /* a wash    */
```

Both themes get their own tint from one definition, and a tint cannot drift from
the colour it is tinting. This replaced twenty-two hand-written `rgba()` values
frozen at the *dark* theme's colours — so a "success" border stayed mint green on
a white panel, and one of them was a third amber matching neither theme.

### Chart tokens

Charts draw through **role** tokens, never palette tokens directly:

| Token | The idea it draws |
| --- | --- |
| `--chart-primary` | the main series — carbohydrate available *with* the plan |
| `--chart-baseline` | the comparison — the same session on water alone |
| `--chart-limit`, `--chart-limit-zone` | the line where the tank runs out, and the region past it |
| `--chart-stop`, `--chart-stop-climb` | a fuelling stop, and one placed for a climb |
| `--chart-terrain`, `--chart-terrain-fill`, `--chart-climb` | the height profile and its climbs |
| `--chart-fitness`, `--chart-fatigue` | the two load curves, always read against each other |
| `--chart-alert` | where something goes wrong |
| `--chart-grid`, `--chart-axis` | gridlines and tick labels |

Four charts were drawing the same three ideas in three different greens and two
different reds, because each reached for a palette token on its own. A role token
is what stops that, and a legend swatch takes the same token as the line it names.

**The assignment rule is about mark size, not taste.** A thin mark needs more
contrast than a large one to stay legible, so lines and dots follow the `-ink`
tokens, which already darken in light mode, while washes and thick marks keep the
vivid token — a darkened colour in a large area only looks muddy. WCAG draws the
same line at 3px, requiring **3:1** for a non-text mark against its surface and
**4.5:1** for text.

Both thresholds are measured in a real browser by `npm run e2e`, because the
tokens are chained (`--chart-primary` → `--post-ink` → `--success-ink` →
`--success`) and several are `color-mix()`, so only a rendering engine knows what
they resolve to. `src/styles.test.ts` guards the rest: no raw colour outside the
token block, no chart mark bypassing a role token, no legend swatch disagreeing
with its line, and no token used that is never defined — an undefined token voids
its whole declaration silently, which is how a marker ring and a control's
transition both turned out never to have rendered.

## Mobile

* Below 640px the primary navigation becomes a **fixed bottom bar**, where a
  thumb reaches, with `env(safe-area-inset-bottom)` padding for notched phones.
  Note the header cannot carry a `backdrop-filter` at that width: it would become
  the containing block for the nav's `position: fixed` and pin it inside the
  header.
* Every interactive element clears **44px** on touch.
* Panels get more padding, a stronger border and a shadow, so a long scroll reads
  as distinct sections rather than one continuous surface.
* `.section-head` carries a short accent rule before the title — two pixels that
  do most of the work in separating sections on a narrow screen.

## Component primitives

| Class | What |
| --- | --- |
| `.panel` | the card container (surface + border + `--radius-lg`) |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-danger` | buttons |
| `.segmented` / `.seg` (`.active`) | segmented single-select control |
| `<ChoiceRow>` / `.choice-row` | one choice from a few short options, as chips |
| `<ChoiceCards>` / `.choice-card` | one choice from options that need a sentence |
| `<ReadMore>` / `<MoreList>` | long prose and long lists, folded to their first lines |
| `.badge` + `.badge-pre/-during/-post` | filled phase labels |
| `.pill` | outlined count / status pill |
| `.tag` (`.caf`, `.tag-house`) | attribute chips |
| `.score-badge` | numeric fit score |
| `.stat` / `.stat-value` / `.stat-label` | KPI tiles |
| `.detail` | muted supporting paragraph |
| `.why` / `.offering` / `.usage` | disclosures (collapsible "show your working") |
| `.field` / `.field-row` / `label` / `select` / `input` | form controls |
| `<Switch>` / `.switch-row` | a setting that applies the moment it is flipped |
| `<Explain>` / `.explain` | the reasoning behind something, closed by default |

## Rules of thumb
1. **Never hard-code a colour or radius** — reference a token. New surfaces pick
   the nearest existing surface token before a new one is added.
2. Prefer an existing primitive over a bespoke element; extend with a modifier
   class (`.badge-during`) rather than a new base.
3. Reach for the spacing/type scales; if a value isn't on the scale, it usually
   shouldn't be used.
4. Semantic colour by meaning: `--accent` = primary/danger, `--success/post` =
   good, `--warn/during` = caution, `--info/pre` = neutral-informational.
5. **Switch vs. checkbox is about when it takes effect, not about looks.** A
   switch *is* the action — flipping it writes immediately (platform settings
   patch the server, profile preferences persist on change), so it should read
   as a state. A checkbox states an intention that a Save button later commits,
   which is why the product form keeps one. A set of options where several can
   be picked (connectable providers, plan phases) stays checkboxes or chips: a
   row of switches would imply each is an independent setting.
   `<Switch>` wraps a real `input[type=checkbox][role=switch]` rather than a
   styled `<button>`, so label association, Space, and the screen-reader
   "on"/"off" announcement come from the browser. The mobile app already used
   `react-native` `Switch` for the same two profile preferences; the web now
   matches it.
6. **A screen shows the answer, not an essay about the answer.** The lead under
   a heading is one line — what this is, in the fewest words that are still
   true. Anything longer is *reasoning*, and reasoning goes in `<Explain>`:
   closed by default, one tap away, findable by the browser's own page search.
   Hiding it entirely would be worse than the wall of text, because the
   reasoning is what makes the recommendation worth trusting; making it the
   first thing to read is worse than either. Two things never collapse:
   safety wording and anything that says what we earn.
7. **Every interactive target is at least 24×24 px** (WCAG 2.5.8), including
   link-styled buttons. Padding, not font size, is what gets them there.
8. **A single choice is shown, not hidden.** A native `<select>` collapses every
   option but one and truncates anything long, which is the wrong trade when the
   list is three to twelve things the athlete is comparing. `<ChoiceRow>` lays
   short options out as chips that flow; `<ChoiceCards>` gives each option its
   explaining sentence and any trailing fact (a date, a distance). Both are real
   radio groups — `role="radiogroup"`, one tab stop, arrows move the selection —
   so the browser announces "3 of 3" without us saying it. A `<select>` is still
   right for a list that is long, alphabetical and not worth comparing: the
   language picker is the example.
9. **Equal columns are a trap in four languages.** A grid track's automatic
   minimum is its content's min-content width, so a row of equal columns sized
   to its longest label and pushed its whole column past a phone's viewport —
   invisible in English, cutting the last option in half in German. Choice rows
   flow instead, and layout columns are `minmax(0, 1fr)`. `npm run e2e` walks
   every screen at 390 px in German and fails on anything that reaches past the
   viewport unclipped.
10. **Long text folds, it is never dropped.** `<ReadMore>` clips prose to a few
   lines and offers "Show more" *only when the text is genuinely clipped* — a
   control that reveals nothing teaches people to ignore it. The text is clipped
   by CSS and stays in the document, so find-in-page and screen readers still
   reach all of it. Same rule as `<Explain>`: reasoning is worth keeping, worth
   folding, never worth deleting.
11. **Selects draw their own chevron.** `appearance: none` plus a per-theme
   `--chevron` data URI, because the native arrow is painted by the OS and
   ignores the theme — on dark it reads as a foreign control. The options list
   itself is still the OS's; `select option` sets its palette. Compact variants
   (admin rows) keep the right padding for the chevron and never drop below a
   36px target — 44px on a phone.
