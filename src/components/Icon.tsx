/**
 * The icon set.
 *
 * Inline SVG, stroked in `currentColor`, no dependency and no icon font — the
 * app is one bundle and a webfont for nine glyphs is a network round trip that
 * can fail. Each is drawn on a 24×24 grid so they optically match at any size.
 *
 * They exist because the interface was almost entirely words. On a phone that
 * reads as a wall: every navigation target, every mode, every action the same
 * shape and weight as the prose around it. A symbol is what lets someone find
 * "Connect" without reading the row.
 *
 * Decorative by default — the label beside an icon is what a screen reader
 * should announce, and repeating it is noise. Pass a `title` only when the icon
 * is genuinely alone.
 */
export type IconName =
  | "home"
  | "plan"
  | "insights"
  | "connect"
  | "team"
  | "catalog"
  | "admin"
  | "race"
  | "route"
  | "session";

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  // A flag on a pole: the thing you are training toward.
  plan: (
    <>
      <path d="M6 21V3" />
      <path d="M6 4h11l-2.2 3.5L17 11H6" />
    </>
  ),
  insights: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V5" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  // Two links of a chain — a connected service.
  connect: (
    <>
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17.5 14.5A6 6 0 0 1 21 20" />
    </>
  ),
  catalog: (
    <>
      <path d="M4.5 8h15l-1.2 12H5.7Z" />
      <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
    </>
  ),
  admin: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  // A finish-line pennant.
  race: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h12v8H6" />
      <path d="M6 9h12M12 5v8" />
    </>
  ),
  // A path across a map.
  route: (
    <>
      <path d="M4 18c4 0 3-9 8-9s4 6 8 6" />
      <circle cx="4" cy="18" r="1.6" />
      <circle cx="20" cy="15" r="1.6" />
    </>
  ),
  // A stopwatch: today's session.
  session: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 10v3.5l2.5 1.5" />
      <path d="M9.5 3h5" />
    </>
  ),
};

export function Icon({ name, title }: { name: IconName; title?: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
