/**
 * English strings — the source language and the shape every other locale must
 * match. `de.ts` is typed against this object, so a forgotten translation is a
 * compile error rather than an English word leaking into a German screen.
 *
 * Keys are dotted and grouped by surface. Placeholders are `{name}`.
 */
export const en = {
  // ---- App shell ----------------------------------------------------------
  "app.skipToContent": "Skip to content",
  "app.brand": "You Go Further",
  "app.nav": "Primary",
  "app.disclaimer":
    "General guidance for healthy adults — not medical advice. Provider connectors use official OAuth scopes; sample data is shown until a real account is linked.",

  "nav.plan": "Plan",
  "nav.progress": "Insights",
  "nav.connect": "Connect",
  "nav.team": "Team",
  "nav.catalog": "Catalog",
  "nav.admin": "Admin",
  "nav.more": "More",

  // ---- Start screen -------------------------------------------------------
  "nav.home": "Home",
  "home.goodMorning": "Good morning, {name}",
  "home.goodAfternoon": "Good afternoon, {name}",
  "home.goodEvening": "Good evening, {name}",
  "home.doNext": "Your next move",
  "home.planSession": "Plan a session",
  "home.logSession": "Log a session",
  "home.thisWeek": "Last 7 days",
  "home.sessions": "Sessions",
  "home.hours": "Hours",
  "home.distance": "Distance",
  "home.climb": "Climbing",
  "home.vsPrevious": "{delta} h vs the week before",
  "home.firstWeek": "Your first week of data — nothing to compare against yet.",
  "home.quietWeek": "A quiet week. Rest is training too, but if it wasn't planned, ease back in.",
  "home.fuelling": "Fuelling",
  "home.notScoredYet": "Not scored yet",
  "home.recent": "Recent sessions",
  "home.noSessions": "No sessions yet. Connect a service and your training appears here.",
  "home.readiness": "Readiness",
  "home.readinessMeasured": "from your devices",
  "home.readinessSelf": "your own estimate",
  "home.longestRecent": "Longest recently",
  "home.fuelIt": "Fuel this one →",
  "home.reviewIt": "How did it go? →",
  "home.logged": "Logged",
  "home.reviewPending": "{count} sessions still to review",
  "home.reviewPending_one": "{count} session still to review",
  "home.shortcuts": "Your tools",
  "home.shortcutTeam": "Your squad",
  "home.shortcutTeamWhy": "Load and fuelling across the athletes you look after.",
  "home.shortcutCatalog": "Product library",
  "home.shortcutCatalogWhy": "Review what the engine can recommend, and add house products.",
  "home.shortcutAdmin": "Platform",
  "home.shortcutAdminWhy": "Users, roles and platform settings.",
  "home.openInsights": "See all insights →",

  // ---- Account menu -------------------------------------------------------
  "account.menu": "Account",
  "account.profile": "Profile & health",
  "account.billing": "Subscription & billing",
  "account.connections": "Connected services",
  "account.switchDemo": "Switch demo account",
  "account.signOut": "Sign out",
  "account.streak": "{days}-day training streak",
  "account.insightsLink": "Insights ›",

  // ---- Appearance & language ---------------------------------------------
  "appearance.title": "Appearance",
  "appearance.system": "System",
  "appearance.light": "Light",
  "appearance.dark": "Dark",
  "language.title": "Language",
  "language.en": "English",
  "language.de": "Deutsch",
  "language.fr": "Français",
  "language.it": "Italiano",

  // ---- Common -------------------------------------------------------------
  "common.of": "of",

  // ---- Domain option labels ----------------------------------------------
  "goal.general-fitness": "General fitness",
  "goal.general-fitness.blurb": "Stay healthy and train comfortably",
  "goal.endurance-performance": "Endurance performance",
  "goal.endurance-performance.blurb": "Go longer and faster",
  "goal.race-preparation": "Race preparation",
  "goal.race-preparation.blurb": "Dial in and rehearse race-day fueling",
  "goal.weight-loss": "Weight loss",
  "goal.weight-loss.blurb": "Lose fat while protecting hard sessions",
  "goal.recovery-focus": "Recovery focus",
  "goal.recovery-focus.blurb": "Bounce back between sessions",

  "activity.running": "Running",
  "activity.trail-running": "Trail running",
  "activity.cycling": "Cycling",
  "activity.triathlon": "Triathlon",
  "activity.swimming": "Swimming",

  "intensity.easy": "Easy",
  "intensity.moderate": "Moderate",
  "intensity.hard": "Hard",
  "intensity.race": "Race",

  "conditions.cool": "Cool",
  "conditions.temperate": "Temperate",
  "conditions.hot": "Hot",

  "sweat.light": "Light",
  "sweat.average": "Average",
  "sweat.heavy": "Heavy",
  "sweat.lightText": "light sweat",
  "sweat.averageText": "average sweat",
  "sweat.heavyText": "heavy sweat",

  // ---- Planner ------------------------------------------------------------
  "plan.goal": "Goal",
  "plan.activity": "Activity",
  "plan.intensity": "Intensity",
  "plan.duration": "Duration",
  "plan.conditions": "Conditions",
  "plan.carbPerHour": "Carb / hour",
  "plan.fluidPerHour": "Fluid / hour",
  "plan.phasePre": "Before",
  "plan.phaseDuring": "During",
  "plan.phasePost": "After",

  // ---- Planner (detail) ---------------------------------------------------
  "plan.sessionDetails": "Session details",
  "plan.carbTotal": "Carb total",
  "plan.sodiumPerLitreLong": "Sodium / litre",
  "plan.measured": "measured",
  "plan.tunedTo": "Tuned to",
  "plan.editProfile": "Edit profile",
  "plan.caffeineOk": "caffeine ok",
  "plan.measuredSignals": "measured signals",
  "plan.whyThese": "Why these — ingredients & combo",
  "plan.notes": "Notes & caveats",
  "plan.house": "house",
  "plan.simulate": "Simulate",
  "plan.reset": "Reset",
  "plan.shopThisPlan": "Shop this plan",

  "plan.pause": "Pause",
  "plan.replay": "Replay",
  "profile.savedLocally": "saved on this device",

  // ---- Insights -----------------------------------------------------------
  "insights.score": "Fuelling score",
  "insights.sessionsLogged": "{count} sessions logged",
  "insights.sessionsLogged_one": "{count} session logged",
  "insights.doNext": "Do this next",
  "insights.worthAttention": "Worth attention",
  "insights.yourTraining": "Your training",
  "insights.activities": "Activities",
  "insights.hours": "Hours",
  "insights.longSessions": "Long sessions",
  "insights.logged": "Logged",
  "insights.milestones": "Milestones",
  "insights.noSessions": "No sessions synced yet — connect a service and your real training shows up here.",
  "insights.connectService": "Connect a service",
  "insights.streak": "{days}-day streak · best {best}",
  "insights.notScored":
    "Log a session and this starts tracking how well your fuelling is actually working — energy, gut, and whether the long ones are covered.",
  "insights.bandGettingStarted": "Getting started",
  "insights.bandBuilding": "Building",
  "insights.bandSolid": "Solid",
  "insights.bandDialledIn": "Dialled in",

  // ---- Fuelling next actions (ids come from the engine) -------------------
  "action.logFirst": "Log your next session",
  "action.logFirst.why": "One log tells the planner how the fuelling felt — it's what everything else here learns from.",
  "action.lowerCarbRate": "Lower your carb rate ~10 g/h and rebuild",
  "action.lowerCarbRate.why":
    "Gut distress is limiting you. The engine has already capped your ceiling; rebuild in small steps over a few weeks.",
  "action.addCarbs": "Add ~10 g/h of carbohydrate on sessions over 90 minutes",
  "action.addCarbs.why": "You're fading with a settled gut — the clearest sign there's headroom to fuel more.",
  "action.measureSweat": "Measure your sweat rate once",
  "action.measureSweat.why":
    "It takes one 90-minute session and replaces a population estimate with your own number for fluid and sodium.",
  "action.connectService": "Connect your training service",
  "action.connectService.why": "Plans then use your real sessions and terrain instead of what you type in.",
  "action.logMore": "Log {count} more sessions",
  "action.logMore_one": "Log {count} more session",
  "action.logMore.why": "At five, the engine starts adapting your carb target to your own gut and energy.",
  "action.rehearseRace": "Rehearse race fuelling on your next long session",
  "action.rehearseRace.why":
    "Your fuelling is working. The remaining gain is practising it at race rate so nothing is new on the day.",

  // ---- Connect ------------------------------------------------------------
  "connect.title": "Connections",
  "connect.connect": "Connect",
  "connect.disconnect": "Disconnect",
  "connect.locked": "Locked",
  "connect.route": "Route & fuel stops",
  "connect.withGps": "{count} with GPS",
  "connect.routeIntro":
    "A recorded route with fuelling stops pinned along it — where to take carbs so you never run the tank down. Swiss routes use the official swisstopo national map, with terrain from swisstopo and conditions from the nearest MeteoSwiss station.",
  "connect.chooseSession": "Choose a session",
  "connect.baseMap": "Base map",
  "connect.terrain": "Terrain",
  "connect.weather": "Weather",
  "connect.planRoute": "Plan for this route →",
  "connect.analysisSettings": "Analysis settings",
  "connect.usingProfile": "Using your profile: {weight} kg · max HR {maxHr} bpm",
  "connect.bodySignals": "Body signals",
  "connect.trainingAnalysis": "Training analysis",

  // ---- Route fuelling by terrain -----------------------------------------
  "route.fuelByTerrain": "Fuelling on this route",
  "route.chartLabel": "Height profile with {count} fuelling stops over {gain} m of climbing",
  "route.byTerrain": "placed by terrain",
  "route.evenSpacing": "even spacing",
  "route.explain":
    "Stops are placed where the energy actually goes: climbing costs up to 2.5× the flat per metre, so a feed lands on the approach to a climb rather than on it, and never deep in a descent where eating is impractical.",

  "route.estimatedProfile":
    "Height profile estimated — swisstopo was unreachable, so the shape is indicative and the stop times are approximate.",

  // ---- Shop / affiliate ---------------------------------------------------
  "shop.orderAt": "Order at {brand} →",
  "shop.noShop": "No shop is listed for these products yet.",
  "shop.needsApi": "Connect the app to its API to see where to order these.",
  "shop.affiliateNote":
    "You order directly from the brand. We earn a commission on partner orders — it costs you nothing extra, and it is what keeps this app free.",
  "shop.noPartnerNote":
    "You order directly from the brand. We have no partner agreement with them, so we earn nothing on this — the link is here because it is the right product.",
  "shop.affiliateAmount": "About CHF {chf} on this basket.",

  // ---- Race / route import ------------------------------------------------
  "race.title": "Plan a race or route",
  "race.intro":
    "Drop in the GPX from the race organiser — or any route you have planned — and get the fueling for that exact course: how much per hour, and where on the climbs to take it.",
  "race.drop": "Drop a .gpx file here",
  "race.choose": "Choose a file",
  "race.privacy": "The file is read on your device. Only the route line is sent on, for terrain and weather.",
  "race.noRoute": "No route found in that file. A GPX from a race organiser, Strava, Komoot or swisstopo will work.",
  "race.tooBig": "That file is larger than 8 MB — export the route without heart-rate and cadence data.",
  "race.another": "Import another",
  "race.unnamed": "Imported route",
  "race.finishTime": "Target finish time",
  "race.estimateNote": "Estimated from distance and climbing. Set your own target — the plan follows it.",
  "race.loadingMap": "Loading map…",
  "home.planRace": "Plan a race",

  // ---- Session debrief ----------------------------------------------------
  "debrief.title": "How this one went",
  "debrief.needed": "This route needed",
  "debrief.youTook": "You took",
  "debrief.short": "{gap} g/h short",
  "debrief.onTarget": "On target",
  "debrief.notLogged": "Not logged yet",
  "debrief.howWasIt": "How did it go?",
  "debrief.gut": "Gut",
  "debrief.energy": "Energy",
  "debrief.actualCarbs": "Carbs you took",
  "debrief.save": "Save and see the debrief",
  "debrief.whereToTake": "Where to take what, next time",
  "debrief.leadToPlan": "Here is the same route with the fuelling it needed — what to take, and where.",
  "debrief.verdictUnderFuelled": "Under-fuelled",
  "debrief.verdictAboutRight": "Well fuelled",
  "debrief.verdictOverGut": "Gut-limited",
  "debrief.verdictUnknown": "Not enough to judge",
  "debrief.gi.none": "Fine",
  "debrief.gi.mild": "A bit off",
  "debrief.gi.severe": "Bad",
  "debrief.energy.bonked": "Bonked",
  "debrief.energy.faded": "Faded",
  "debrief.energy.steady": "Steady",
  "debrief.energy.strong": "Strong",
  "finding.underFuelled": "You took about {actual} g/h; this route's climbing called for {required} g/h — roughly {gap} g/h short.",
  "finding.aboutRight": "Fuelling matched what this route demanded — repeat it.",
  "finding.gutLimited": "Your gut was the limiter here, not the amount. Drop the rate and rebuild it before adding more.",
  "finding.startedLate": "Start earlier, too: the first feed wants to be inside the first 30–40 minutes, not at {atMin}.",
  "finding.climbUnfuelled": "The {gain} m climb from km {km} is where that gap bites — take carbohydrate on the approach next time.",
  "finding.noLog": "Tell us how this one went and we can show you exactly where the fuelling fell short.",
  "finding.shortSession": "Under an hour — carbohydrate during the session isn't what decided how this felt.",

  // ---- Catalog & shop -----------------------------------------------------
  "catalog.title": "Product library",
  "catalog.bestWhen": "Best when",

  // ---- Profile ------------------------------------------------------------
  "profile.bodyWeight": "Body weight",
  "profile.maxHr": "Max heart rate",
  "profile.sweatRate": "Sweat rate",
  "profile.sweatSodium": "Sweat sodium",
  "profile.synced": "synced to your account",

  "profile.yourProfile": "Your profile",
  "profile.bodyPrefs": "Body & preferences",
  "profile.sweatLevelShort": "Sweat level",
  "profile.caffeineLong": "I tolerate caffeine — suggest it for long / hard efforts",
  "profile.measuredSignals": "Measured body signals",
  "profile.syncPlatform": "Sync from your health platform",
  "profile.useMeasuredSignals": "Use my measured body signals",

  // ---- Auth ---------------------------------------------------------------
  "auth.headline": "Fuel smarter, go further",
  "auth.continueEmail": "Continue with email",
  "auth.sendLink": "Email me a sign-in link",
  "auth.openDevLink": "Open the link (dev mailer)",

  "auth.subtitle": "Sign in or create your account to sync your training and fueling.",
  "auth.continueApple": "Continue with Apple",
  "auth.continueGoogle": "Continue with Google",
  "auth.signingIn": "Signing in…",
  "auth.sending": "Sending…",
  "auth.createOrSignIn": "Create account / sign in",
  "auth.sentTo": "Check your inbox — we sent a sign-in link to {email}. It works once and expires in 15 minutes.",
  "auth.differentAddress": "← use a different address",
  "auth.otherOptions": "← other options",
  "auth.namePlaceholder": "Your name (optional)",
  "auth.emailPlaceholder": "you@example.com",
  "auth.terms": "By continuing you agree to our terms.",
  "auth.termsLive": "Sign-in is verified server-side — social tokens against the provider, email via a single-use link.",
  "auth.termsDemo": "Running without a server: sign-in is simulated for the demo.",
  "auth.exploreDemo": "Explore a demo account",

  "toast.paymentReceived": "Payment received — thank you!",
  "toast.planActive": "Your {tier} plan is active.",
  "toast.connected": "{provider} connected — your sessions are syncing.",
  "toast.planningRoute": "Planning for your route — conditions applied",
  "toast.sessionLogged": "Logged — here's what it tells us.",
  "toast.saveFailed": "Couldn't save that. Try again.",

  // ---- Nutrition guide ----------------------------------------------------
  "guide.title": "Fuel & nutrition guide",
  "guide.inPractice": "In practice",
  "guide.pitfalls": "Common mistakes",
  "guide.readMinutes": "{count} min read",
  "guide.englishOnly": "Guide articles are currently available in English only.",
  "guide.articles": "{count} articles",
  "guide.intro":
    "The evidence behind every plan — what to do, how much, and why. Written against mainstream sports-nutrition consensus.",
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
