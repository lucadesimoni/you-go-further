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
  "common.save": "Speichern",
  "common.saved": "Gespeichert",
  "common.cancel": "Abbrechen",
  "common.back": "Zurück",
  "common.close": "Schliessen",
  "common.loading": "Wird geladen…",
  "common.retry": "Erneut versuchen",
  "common.continue": "Weiter",
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
  "plan.title": "Ihre Einheit",
  "plan.goal": "Ziel",
  "plan.activity": "Sportart",
  "plan.intensity": "Intensität",
  "plan.duration": "Dauer",
  "plan.conditions": "Bedingungen",
  "plan.fromProfile": "Aus Ihrem Profil: {weight} kg · Koffein {caffeine}",
  "plan.edit": "Bearbeiten",
  "plan.get": "Plan erstellen",
  "plan.refresh": "Plan aktualisieren",
  "plan.carbPerHour": "Kohlenhydrate / Std.",
  "plan.fluidPerHour": "Flüssigkeit / Std.",
  "plan.sodiumPerLitre": "Natrium / l",
  "plan.schedule": "Ablauf während der Einheit",
  "plan.why": "Warum dieser Plan",
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
  "connect.connected": "{count} verbunden",
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
  "connect.bodySignals": "Körperwerte",
  "connect.trainingAnalysis": "Trainingsanalyse",

  // ---- Catalog & shop -----------------------------------------------------
  "catalog.title": "Produktübersicht",
  "catalog.all": "Alle",
  "catalog.bestWhen": "Ideal wenn",
  "catalog.avoidWhen": "Besser nicht wenn",
  "catalog.cart": "Verpflegung für Ihre Einheit",
  "catalog.buildCart": "Warenkorb zusammenstellen",
  "catalog.checkout": "Zur Kasse · CHF {amount}",
  "catalog.subtotal": "Zwischensumme",
  "catalog.orders": "Ihre Bestellungen",
  "catalog.noOrders":
    "Noch keine Bestellungen. Stellen Sie oben einen Warenkorb zusammen — alles Gekaufte erscheint hier.",

  // ---- Profile ------------------------------------------------------------
  "profile.title": "Profil & Gesundheit",
  "profile.body": "Ihr Körper",
  "profile.bodyWeight": "Körpergewicht",
  "profile.sweatLevel": "Wie stark Sie schwitzen",
  "profile.sweatLight": "Wenig",
  "profile.sweatAverage": "Normal",
  "profile.sweatHeavy": "Stark",
  "profile.caffeineOk": "Koffein ist für mich in Ordnung",
  "profile.measured": "Gemessene Schweisswerte",
  "profile.useMeasured": "Meine gemessenen Werte verwenden",
  "profile.sweatRate": "Schweissrate",
  "profile.sweatSodium": "Natrium im Schweiss",
  "profile.readiness": "Erholung",
  "profile.save": "Profil speichern",
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
  "auth.emailLabel": "E-Mail",
  "auth.sendLink": "Anmeldelink zusenden",
  "auth.checkInbox": "Posteingang prüfen",
  "auth.linkSent":
    "Ein Anmeldelink ist unterwegs an {email}. Er ist 15 Minuten gültig und kann einmal verwendet werden.",
  "auth.openDevLink": "Link öffnen (Dev-Mailer)",
  "auth.noPassword": "Warum kein Passwort",
  "auth.noPasswordWhy":
    "Es gibt nichts, was gestohlen oder wiederverwendet werden kann. Der zugesandte Link ist vom Server signiert, läuft nach 15 Minuten ab und funktioniert nur einmal.",

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
  "toast.signInFailed": "Dieser Anmeldelink ist ungültig oder abgelaufen.",

  // ---- Nutrition guide ----------------------------------------------------
  "guide.title": "Ernährungs- & Verpflegungsratgeber",
  "guide.read": "Ratgeber lesen",
  "guide.hide": "Ratgeber ausblenden",
  "guide.keyNumbers": "Kernzahlen",
  "guide.inPractice": "In der Praxis",
  "guide.pitfalls": "Häufige Fehler",
  "guide.readMinutes": "{count} Min. Lesezeit",
  "guide.englishOnly": "Die Ratgeber-Artikel sind derzeit nur auf Englisch verfügbar.",
};
