import type { Dictionary } from "./en";

/**
 * German (Swiss usage).
 *
 * Two deliberate choices, both Swiss rather than German-German:
 *  - **ss, never ß** — Switzerland dropped the Eszett; "Strasse", "Grösse".
 *  - **Sie** throughout. Swiss sports brands address customers formally, and it
 *    reads as respectful rather than distant.
 *
 * Typed as `Dictionary`, so leaving a key out fails the build.
 */
export const de: Dictionary = {
  // ---- App shell ----------------------------------------------------------
  "app.skipToContent": "Zum Inhalt springen",
  "app.brand": "You Go Further",
  "app.nav": "Hauptnavigation",
  "app.disclaimer":
    "Allgemeine Empfehlungen für gesunde Erwachsene — keine medizinische Beratung. Die Anbieter-Verbindungen nutzen offizielle OAuth-Berechtigungen; bis ein echtes Konto verknüpft ist, werden Beispieldaten angezeigt.",

  "nav.plan": "Planen",
  "nav.progress": "Auswertung",
  "nav.connect": "Verbinden",
  "nav.team": "Team",
  "nav.catalog": "Produkte",
  "nav.admin": "Verwaltung",
  "nav.more": "Mehr",

  // ---- Account menu -------------------------------------------------------
  "account.menu": "Konto",
  "account.profile": "Profil & Gesundheit",
  "account.billing": "Abo & Rechnung",
  "account.connections": "Verbundene Dienste",
  "account.switchDemo": "Demo-Konto wechseln",
  "account.signOut": "Abmelden",
  "account.streak": "{days} Tage Trainingsserie",
  "account.insightsLink": "Auswertung ›",

  // ---- Appearance & language ---------------------------------------------
  "appearance.title": "Darstellung",
  "appearance.system": "System",
  "appearance.light": "Hell",
  "appearance.dark": "Dunkel",
  "language.title": "Sprache",
  "language.en": "English",
  "language.de": "Deutsch",

  // ---- Common -------------------------------------------------------------
  "common.of": "von",

  // ---- Domain option labels ----------------------------------------------
  "goal.general-fitness": "Allgemeine Fitness",
  "goal.general-fitness.blurb": "Gesund bleiben und angenehm trainieren",
  "goal.endurance-performance": "Ausdauerleistung",
  "goal.endurance-performance.blurb": "Länger und schneller unterwegs sein",
  "goal.race-preparation": "Wettkampfvorbereitung",
  "goal.race-preparation.blurb": "Verpflegung für den Wettkampftag einstellen und proben",
  "goal.weight-loss": "Gewichtsabnahme",
  "goal.weight-loss.blurb": "Fett verlieren, ohne harte Einheiten zu gefährden",
  "goal.recovery-focus": "Regeneration",
  "goal.recovery-focus.blurb": "Zwischen den Einheiten schneller erholen",

  "activity.running": "Laufen",
  "activity.trail-running": "Trailrunning",
  "activity.cycling": "Radfahren",
  "activity.triathlon": "Triathlon",
  "activity.swimming": "Schwimmen",

  "intensity.easy": "Locker",
  "intensity.moderate": "Mittel",
  "intensity.hard": "Hart",
  "intensity.race": "Wettkampf",

  "conditions.cool": "Kühl",
  "conditions.temperate": "Gemässigt",
  "conditions.hot": "Heiss",

  "sweat.light": "Wenig",
  "sweat.average": "Normal",
  "sweat.heavy": "Stark",
  "sweat.lightText": "schwitzt wenig",
  "sweat.averageText": "schwitzt normal",
  "sweat.heavyText": "schwitzt stark",

  // ---- Planner ------------------------------------------------------------
  "plan.goal": "Ziel",
  "plan.activity": "Sportart",
  "plan.intensity": "Intensität",
  "plan.duration": "Dauer",
  "plan.conditions": "Bedingungen",
  "plan.carbPerHour": "Kohlenhydrate / Std.",
  "plan.fluidPerHour": "Flüssigkeit / Std.",
  "plan.phasePre": "Vorher",
  "plan.phaseDuring": "Währenddessen",
  "plan.phasePost": "Danach",

  // ---- Planner (detail) ---------------------------------------------------
  "plan.sessionDetails": "Angaben zur Einheit",
  "plan.carbTotal": "Kohlenhydrate gesamt",
  "plan.sodiumPerLitreLong": "Natrium / Liter",
  "plan.measured": "gemessen",
  "plan.tunedTo": "Abgestimmt auf",
  "plan.editProfile": "Profil bearbeiten",
  "plan.caffeineOk": "Koffein in Ordnung",
  "plan.measuredSignals": "gemessene Werte",
  "plan.whyThese": "Warum diese — Inhaltsstoffe & Kombination",
  "plan.notes": "Hinweise & Einschränkungen",
  "plan.house": "Eigenmarke",
  "plan.simulate": "Simulieren",
  "plan.reset": "Zurücksetzen",
  "plan.shopThisPlan": "Diesen Plan einkaufen",

  "plan.pause": "Pause",
  "plan.replay": "Erneut abspielen",
  "profile.savedLocally": "auf diesem Gerät gespeichert",

  // ---- Insights -----------------------------------------------------------
  "insights.score": "Verpflegungs-Score",
  "insights.sessionsLogged": "{count} Einheiten erfasst",
  "insights.sessionsLogged_one": "{count} Einheit erfasst",
  "insights.doNext": "Das als Nächstes",
  "insights.worthAttention": "Beachtenswert",
  "insights.yourTraining": "Ihr Training",
  "insights.activities": "Einheiten",
  "insights.hours": "Stunden",
  "insights.longSessions": "Lange Einheiten",
  "insights.logged": "Erfasst",
  "insights.milestones": "Meilensteine",
  "insights.noSessions":
    "Noch keine Einheiten synchronisiert — verbinden Sie einen Dienst, dann erscheint hier Ihr echtes Training.",
  "insights.connectService": "Dienst verbinden",
  "insights.streak": "{days} Tage in Folge · Bestwert {best}",
  "insights.notScored":
    "Erfassen Sie eine Einheit, dann zeigt dieser Wert, wie gut Ihre Verpflegung wirklich funktioniert — Energie, Magen und ob die langen Einheiten abgedeckt sind.",
  "insights.bandGettingStarted": "Am Anfang",
  "insights.bandBuilding": "Im Aufbau",
  "insights.bandSolid": "Solide",
  "insights.bandDialledIn": "Bestens eingestellt",

  // ---- Connect ------------------------------------------------------------
  "connect.title": "Verbindungen",
  "connect.connect": "Verbinden",
  "connect.disconnect": "Trennen",
  "connect.locked": "Gesperrt",
  "connect.route": "Route & Verpflegungsstopps",
  "connect.withGps": "{count} mit GPS",
  "connect.routeIntro":
    "Eine aufgezeichnete Route mit eingezeichneten Verpflegungsstopps — wo Sie Kohlenhydrate nehmen, damit Ihnen nie der Treibstoff ausgeht. Schweizer Routen nutzen die offizielle Landeskarte von swisstopo, mit Gelände von swisstopo und Bedingungen der nächstgelegenen MeteoSchweiz-Station.",
  "connect.chooseSession": "Einheit auswählen",
  "connect.baseMap": "Kartenhintergrund",
  "connect.terrain": "Gelände",
  "connect.weather": "Wetter",
  "connect.planRoute": "Für diese Route planen →",
  "connect.athleteProfile": "Athletenprofil",
  "connect.bodySignals": "Körperwerte",
  "connect.trainingAnalysis": "Trainingsanalyse",

  // ---- Route fuelling by terrain -----------------------------------------
  "route.fuelByTerrain": "Verpflegung auf dieser Route",
  "route.chartLabel": "Höhenprofil mit {count} Verpflegungsstopps über {gain} Höhenmeter",
  "route.byTerrain": "nach Gelände gesetzt",
  "route.evenSpacing": "gleichmässige Abstände",
  "route.explain":
    "Die Stopps liegen dort, wo die Energie tatsächlich verbraucht wird: Bergauf kostet pro Meter bis zu 2,5-mal so viel wie flach. Deshalb liegt eine Verpflegung vor dem Anstieg statt mitten darin — und nie tief in einer Abfahrt, wo Essen kaum möglich ist.",

  "route.estimatedProfile":
    "Höhenprofil geschätzt — swisstopo war nicht erreichbar. Der Verlauf ist ungefähr, die Zeitpunkte entsprechend grob.",

  // ---- Catalog & shop -----------------------------------------------------
  "catalog.title": "Produktübersicht",
  "catalog.bestWhen": "Ideal wenn",

  // ---- Profile ------------------------------------------------------------
  "profile.bodyWeight": "Körpergewicht",
  "profile.sweatRate": "Schweissrate",
  "profile.sweatSodium": "Natrium im Schweiss",
  "profile.synced": "mit Ihrem Konto synchronisiert",

  "profile.yourProfile": "Ihr Profil",
  "profile.bodyPrefs": "Körper & Vorlieben",
  "profile.sweatLevelShort": "Schweissniveau",
  "profile.caffeineLong": "Ich vertrage Koffein — für lange / harte Einheiten vorschlagen",
  "profile.measuredSignals": "Gemessene Körperwerte",
  "profile.syncPlatform": "Von Ihrer Gesundheits-Plattform synchronisieren",
  "profile.useMeasuredSignals": "Meine gemessenen Körperwerte verwenden",

  // ---- Auth ---------------------------------------------------------------
  "auth.headline": "Klüger verpflegen, weiter kommen",
  "auth.continueEmail": "Mit E-Mail fortfahren",
  "auth.sendLink": "Anmeldelink zusenden",
  "auth.openDevLink": "Link öffnen (Dev-Mailer)",

  "auth.subtitle": "Melden Sie sich an oder erstellen Sie ein Konto, um Training und Verpflegung zu synchronisieren.",
  "auth.continueApple": "Weiter mit Apple",
  "auth.continueGoogle": "Weiter mit Google",
  "auth.signingIn": "Anmeldung läuft…",
  "auth.sending": "Wird gesendet…",
  "auth.createOrSignIn": "Konto erstellen / anmelden",
  "auth.sentTo": "Prüfen Sie Ihren Posteingang — wir haben einen Anmeldelink an {email} gesendet. Er funktioniert einmal und läuft in 15 Minuten ab.",
  "auth.differentAddress": "← andere Adresse verwenden",
  "auth.otherOptions": "← andere Optionen",
  "auth.namePlaceholder": "Ihr Name (optional)",
  "auth.emailPlaceholder": "sie@beispiel.ch",
  "auth.terms": "Mit dem Fortfahren akzeptieren Sie unsere Bedingungen.",
  "auth.termsLive": "Die Anmeldung wird serverseitig geprüft — Social-Tokens beim Anbieter, E-Mail über einen einmaligen Link.",
  "auth.termsDemo": "Läuft ohne Server: Die Anmeldung wird für die Demo simuliert.",
  "auth.exploreDemo": "Demo-Konto ausprobieren",

  "toast.paymentReceived": "Zahlung erhalten — vielen Dank!",
  "toast.planActive": "Ihr {tier}-Abo ist aktiv.",
  "toast.connected": "{provider} verbunden — Ihre Einheiten werden synchronisiert.",
  "toast.planningRoute": "Planung für Ihre Route — Bedingungen übernommen",

  // ---- Nutrition guide ----------------------------------------------------
  "guide.title": "Ernährungs- & Verpflegungsratgeber",
  "guide.inPractice": "In der Praxis",
  "guide.pitfalls": "Häufige Fehler",
  "guide.readMinutes": "{count} Min. Lesezeit",
  "guide.englishOnly": "Die Ratgeber-Artikel sind derzeit nur auf Englisch verfügbar.",
  "guide.articles": "{count} Artikel",
  "guide.intro":
    "Die Belege hinter jedem Plan — was zu tun ist, wie viel und warum. Verfasst nach dem gängigen sporternährungswissenschaftlichen Konsens.",
};
