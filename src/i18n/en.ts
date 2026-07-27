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

  // ---- Common -------------------------------------------------------------
  "common.save": "Save",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.continue": "Continue",
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
  "plan.title": "Your session",
  "plan.goal": "Goal",
  "plan.activity": "Activity",
  "plan.intensity": "Intensity",
  "plan.duration": "Duration",
  "plan.conditions": "Conditions",
  "plan.fromProfile": "From your profile: {weight} kg · caffeine {caffeine}",
  "plan.edit": "Edit",
  "plan.get": "Get my plan",
  "plan.refresh": "Refresh my plan",
  "plan.carbPerHour": "Carb / hour",
  "plan.fluidPerHour": "Fluid / hour",
  "plan.sodiumPerLitre": "Sodium / L",
  "plan.schedule": "In-session schedule",
  "plan.why": "Why this plan",
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

  // ---- Connect ------------------------------------------------------------
  "connect.title": "Connections",
  "connect.connected": "{count} connected",
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
  "connect.bodySignals": "Body signals",
  "connect.trainingAnalysis": "Training analysis",

  // ---- Catalog & shop -----------------------------------------------------
  "catalog.title": "Product library",
  "catalog.all": "All",
  "catalog.bestWhen": "Best when",
  "catalog.avoidWhen": "Skip it when",
  "catalog.cart": "Kit for your session",
  "catalog.buildCart": "Build my cart",
  "catalog.checkout": "Checkout · CHF {amount}",
  "catalog.subtotal": "Subtotal",
  "catalog.orders": "Your orders",
  "catalog.noOrders": "No orders yet. Build a cart above and everything you buy shows up here.",

  // ---- Profile ------------------------------------------------------------
  "profile.title": "Profile & health",
  "profile.body": "Your body",
  "profile.bodyWeight": "Body weight",
  "profile.sweatLevel": "How much you sweat",
  "profile.sweatLight": "Light",
  "profile.sweatAverage": "Average",
  "profile.sweatHeavy": "Heavy",
  "profile.caffeineOk": "Caffeine is fine for me",
  "profile.measured": "Measured sweat data",
  "profile.useMeasured": "Use my measured values",
  "profile.sweatRate": "Sweat rate",
  "profile.sweatSodium": "Sweat sodium",
  "profile.readiness": "Readiness",
  "profile.save": "Save profile",
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
  "auth.emailLabel": "Email",
  "auth.sendLink": "Email me a sign-in link",
  "auth.checkInbox": "Check your inbox",
  "auth.linkSent": "A sign-in link is on its way to {email}. It is valid for 15 minutes and works once.",
  "auth.openDevLink": "Open the link (dev mailer)",
  "auth.noPassword": "Why no password",
  "auth.noPasswordWhy":
    "There is nothing to leak or reuse. The emailed link is signed by the server, expires in 15 minutes and can only be used once.",

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
  "toast.signInFailed": "That sign-in link is invalid or has expired.",

  // ---- Nutrition guide ----------------------------------------------------
  "guide.title": "Fuel & nutrition guide",
  "guide.read": "Read the guide",
  "guide.hide": "Hide the guide",
  "guide.keyNumbers": "Key numbers",
  "guide.inPractice": "In practice",
  "guide.pitfalls": "Common mistakes",
  "guide.readMinutes": "{count} min read",
  "guide.englishOnly": "Guide articles are currently available in English only.",
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
