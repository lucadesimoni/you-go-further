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
| `--border` / `--border-strong` | hairlines / emphasized borders |

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

## Component primitives

| Class | What |
| --- | --- |
| `.panel` | the card container (surface + border + `--radius-lg`) |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-danger` | buttons |
| `.segmented` / `.seg` (`.active`) | segmented single-select control |
| `.badge` + `.badge-pre/-during/-post` | filled phase labels |
| `.pill` | outlined count / status pill |
| `.tag` (`.caf`, `.tag-house`) | attribute chips |
| `.score-badge` | numeric fit score |
| `.stat` / `.stat-value` / `.stat-label` | KPI tiles |
| `.detail` | muted supporting paragraph |
| `.why` / `.offering` / `.usage` | disclosures (collapsible "show your working") |
| `.field` / `.field-row` / `label` / `select` / `input` | form controls |

## Rules of thumb
1. **Never hard-code a colour or radius** — reference a token. New surfaces pick
   the nearest existing surface token before a new one is added.
2. Prefer an existing primitive over a bespoke element; extend with a modifier
   class (`.badge-during`) rather than a new base.
3. Reach for the spacing/type scales; if a value isn't on the scale, it usually
   shouldn't be used.
4. Semantic colour by meaning: `--accent` = primary/danger, `--success/post` =
   good, `--warn/during` = caution, `--info/pre` = neutral-informational.
