/**
 * The icon set.
 *
 * Inline SVG, stroked in `currentColor`, no dependency and no icon font — the
 * app is one bundle and a webfont for two dozen glyphs is a network round trip
 * that can fail. Each is drawn on a 24×24 grid so they match at any size.
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
  | "session"
  // Sports — the "what are you doing" choice.
  | "run"
  | "trail"
  | "bike"
  | "swim"
  | "triathlon"
  // Conditions — the "what is it like out there" choice.
  | "cold"
  | "mild"
  | "hot"
  // Goals.
  | "heart"
  | "trend"
  | "scale"
  | "moon"
  | "drop1"
  | "drop2"
  | "drop3";

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
  // A figure mid-stride.
  run: (
    <>
      <circle cx="14.5" cy="4.8" r="2" />
      <path d="M15.5 9.5 11 12l2 3.5-1 5.5" />
      <path d="M15.5 9.5 19 11.5l1.5-2" />
      <path d="M13 15.5 8 18" />
      <path d="M11 12 6.5 10" />
    </>
  ),
  // Two peaks: the same run, uphill.
  trail: (
    <>
      <path d="M2 19.5 8 9.5l4 6.5" />
      <path d="M11 19.5 16 11l6 8.5z" />
    </>
  ),
  bike: (
    <>
      <circle cx="5.5" cy="16.5" r="3.4" />
      <circle cx="18.5" cy="16.5" r="3.4" />
      <path d="M5.5 16.5h6l-2.5-7" />
      <path d="M11.5 16.5 15.5 9.5h3" />
      <path d="M7.5 9.5h4" />
    </>
  ),
  swim: (
    <>
      <circle cx="6.5" cy="7.5" r="1.8" />
      <path d="M9 12.5 13.5 9l4 3.5" />
      <path d="M2 18.5c1.6 0 2-1.2 3.5-1.2s2 1.2 3.5 1.2 2-1.2 3.5-1.2 2 1.2 3.5 1.2 2-1.2 3.5-1.2" />
    </>
  ),
  // Three disciplines stacked: water, wheel, road.
  triathlon: (
    <>
      <path d="M2 5.5c1.6 0 2-1.2 3.5-1.2S7.5 5.5 9 5.5s2-1.2 3.5-1.2S14.5 5.5 16 5.5s2-1.2 3.5-1.2" />
      <circle cx="7" cy="14" r="3.6" />
      <path d="M13 20h9" />
      <path d="M14.5 11h7" />
      <path d="M13.5 15.5h8" />
    </>
  ),
  // A snowflake.
  cold: (
    <>
      <path d="M12 2.5v19" />
      <path d="M4 7 20 17" />
      <path d="M20 7 4 17" />
      <path d="M9 4.5 12 6.5 15 4.5" />
      <path d="M9 19.5 12 17.5 15 19.5" />
    </>
  ),
  // A thermometer, sitting mid-scale.
  mild: (
    <>
      <path d="M14 14.3V6a2 2 0 0 0-4 0v8.3a4 4 0 1 0 4 0z" />
      <path d="M12 10.5v5" />
    </>
  ),
  // The sun.
  hot: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
      <path d="M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
    </>
  ),
  heart: <path d="M12 20.5C9.5 18.6 4 14.6 4 10.5A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 8 2.5c0 4.1-5.5 8.1-8 10z" />,
  // A rising line: going longer and faster.
  trend: (
    <>
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </>
  ),
  // A downward arrow onto a scale.
  scale: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9.5 12 13.5 16 9.5" />
      <path d="M4 18h16" />
      <path d="M4 18v2M20 18v2" />
    </>
  ),
  // A crescent: rest.
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.6 3.9 8.2 8.2 0 1 0 20 14.2z" />,
  // One, two, three drops — a ramp, so the sweat scale reads without the
  // labels. Three identical drops would have been decoration; a rising count
  // carries the same information the words do.
  drop1: <path d="M12 8 14.6 12.6A3 3 0 1 1 9.4 12.6Z" />,
  drop2: (
    <>
      <path d="M8 7 10.4 11.2A2.7 2.7 0 1 1 5.6 11.2Z" />
      <path d="M16 11 18.4 15.2A2.7 2.7 0 1 1 13.6 15.2Z" />
    </>
  ),
  drop3: (
    <>
      <path d="M6.5 6 8.6 9.7A2.4 2.4 0 1 1 4.4 9.7Z" />
      <path d="M17.5 6 19.6 9.7A2.4 2.4 0 1 1 15.4 9.7Z" />
      <path d="M12 11.5 14.1 15.2A2.4 2.4 0 1 1 9.9 15.2Z" />
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
