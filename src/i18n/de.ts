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

  // ---- Start screen -------------------------------------------------------
  "nav.home": "Start",
  "home.goodMorning": "Guten Morgen, {name}",
  "home.goodAfternoon": "Guten Tag, {name}",
  "home.goodEvening": "Guten Abend, {name}",
  "home.doNext": "Ihr nächster Schritt",
  "home.planSession": "Einheit planen",
  "home.logSession": "Einheit erfassen",
  "home.thisWeek": "Letzte 7 Tage",
  "home.sessions": "Einheiten",
  "home.hours": "Stunden",
  "home.distance": "Distanz",
  "home.climb": "Höhenmeter",
  "home.vsPrevious": "{delta} h gegenüber der Vorwoche",
  "home.firstWeek": "Ihre erste Woche mit Daten — noch kein Vergleich möglich.",
  "home.quietWeek": "Eine ruhige Woche. Erholung gehört dazu — war sie ungeplant, steigen Sie behutsam wieder ein.",
  "home.fuelling": "Verpflegung",
  "home.notScoredYet": "Noch nicht bewertet",
  "home.recent": "Letzte Einheiten",
  "home.noSessions": "Noch keine Einheiten. Verbinden Sie einen Dienst, dann erscheint Ihr Training hier.",
  "home.readiness": "Erholung",
  "home.readinessMeasured": "von Ihren Geräten",
  "home.readinessSelf": "Ihre eigene Einschätzung",
  "home.longestRecent": "Längste zuletzt",
  "home.fuelIt": "Diese verpflegen →",
  "home.reviewIt": "Wie lief sie? →",
  "home.logged": "Erfasst",
  "home.reviewPending": "{count} Einheiten noch nicht ausgewertet",
  "home.reviewPending_one": "{count} Einheit noch nicht ausgewertet",
  "home.shortcuts": "Ihre Werkzeuge",
  "home.shortcutTeam": "Ihr Kader",
  "home.shortcutTeamWhy": "Belastung und Verpflegung der von Ihnen betreuten Athletinnen und Athleten.",
  "home.shortcutCatalog": "Produktübersicht",
  "home.shortcutCatalogWhy": "Prüfen, was der Algorithmus empfehlen kann, und Eigenmarken ergänzen.",
  "home.shortcutAdmin": "Plattform",
  "home.shortcutAdminWhy": "Benutzer, Rollen und Plattform-Einstellungen.",
  "home.openInsights": "Alle Auswertungen →",

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
  "language.fr": "Français",
  "language.it": "Italiano",

  // ---- Common -------------------------------------------------------------
  "common.of": "von",
  "common.whyThis": "Warum das",

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
  "absorb.title": "Mehr, als Ihr Magen aufnehmen kann",
  "absorb.ceiling": "max. ~{ceiling} g/h",
  "absorb.body":
    "Der Plan verlangt {target} g/h, diese Produkte liefern aber nur rund {ceiling} g/h — etwa {short} g/h blieben im Magen, statt den Muskel zu erreichen.",
  "absorb.why":
    "Kohlenhydrate gelangen über Transporter durch die Darmwand, und Glukose sättigt ihren eigenen bei etwa 60 g/h. Fruktose öffnet einen zweiten Weg und hebt die Grenze auf rund 90 g/h. Darüber zieht der Überschuss Wasser in den Darm — genau das steckt meist hinter «der Magen hat zugemacht».",

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
    "Erfassen Sie eine Einheit — dann misst dieser Wert, wie gut Ihre Verpflegung wirkt.",
  "insights.bandGettingStarted": "Am Anfang",
  "insights.bandBuilding": "Im Aufbau",
  "insights.bandSolid": "Solide",
  "insights.bandDialledIn": "Bestens eingestellt",

  // ---- Training load ------------------------------------------------------
  "load.title": "Fitness, Ermüdung und Form",
  "load.fitness": "Fitness",
  "load.fitnessNote": "42-Tage-Belastung",
  "load.fatigue": "Ermüdung",
  "load.fatigueNote": "7-Tage-Belastung",
  "load.form": "Form",
  "load.formNote": "Fitness − Ermüdung",
  "load.ramp": "Anstieg",
  "load.rampNote": "pro Woche",
  "load.building": "im Aufbau",
  "load.steady": "gleichmässig",
  "load.tapering": "im Tapering",
  "load.detraining": "im Abbau",
  "load.chartLabel": "Fitness und Ermüdung der letzten {days} Tage",
  "load.explain":
    "Fitness ist Ihre Trainingsbelastung über sechs Wochen gemittelt, Ermüdung dieselbe Belastung über eine Woche. Form ist die Differenz — negativ, solange Sie aufbauen, positiv, sobald Sie es verarbeitet haben. Das gehört auf eine Ernährungsseite, weil jeder Zustand die Verpflegung verändert: bei starker Ermüdung werden Kohlenhydrate und Protein zur Regeneration dringend, und ein schneller Anstieg hebt Ihren wöchentlichen Kohlenhydratbedarf.",
  "load.explainMonotony":
    "Monotonie {monotony} bei {days} aktiven Tagen — wie ähnlich sich Ihre Tage sind. Über 2 folgt auf harte Tage nie ein lockerer, und genau dort häufen sich Stagnation und Infekte.",

  // ---- Fuelling next actions (ids come from the engine) -------------------
  "action.logFirst": "Erfassen Sie Ihre nächste Einheit",
  "action.logFirst.why":
    "Eine einzige Erfassung zeigt dem Planer, wie sich die Verpflegung angefühlt hat — daraus lernt alles Weitere hier.",
  "action.lowerCarbRate": "Kohlenhydratrate um ~10 g/h senken und neu aufbauen",
  "action.lowerCarbRate.why":
    "Ihr Magen bremst Sie. Der Algorithmus hat Ihre Obergrenze bereits gesenkt; bauen Sie über einige Wochen in kleinen Schritten wieder auf.",
  "action.addCarbs": "Bei Einheiten über 90 Minuten ~10 g/h mehr Kohlenhydrate",
  "action.addCarbs.why":
    "Ihnen geht die Energie aus, während der Magen ruhig bleibt — das deutlichste Zeichen, dass noch Luft nach oben ist.",
  "action.measureSweat": "Messen Sie Ihre Schweissrate einmal",
  "action.measureSweat.why":
    "Eine 90-minütige Einheit genügt — danach ersetzt Ihr eigener Wert die Schätzung für Flüssigkeit und Natrium.",
  "action.connectService": "Verbinden Sie Ihren Trainingsdienst",
  "action.connectService.why":
    "Die Pläne nutzen dann Ihre echten Einheiten und das Gelände statt Ihrer Eingaben.",
  "action.logMore": "Erfassen Sie {count} weitere Einheiten",
  "action.logMore_one": "Erfassen Sie {count} weitere Einheit",
  "action.logMore.why":
    "Ab fünf Einheiten passt der Algorithmus Ihr Kohlenhydratziel an Ihren Magen und Ihre Energie an.",
  "action.rehearseRace": "Proben Sie die Wettkampfverpflegung in der nächsten langen Einheit",
  "action.rehearseRace.why":
    "Ihre Verpflegung funktioniert. Der verbleibende Gewinn liegt darin, sie im Wettkampftempo zu üben, damit am Tag nichts neu ist.",

  // ---- Connect ------------------------------------------------------------
  "connect.title": "Verbindungen",
  "connect.connect": "Verbinden",
  "connect.disconnect": "Trennen",
  "connect.locked": "Gesperrt",
  "connect.route": "Route & Verpflegungsstopps",
  "connect.withGps": "{count} mit GPS",
  "connect.routeIntro": "Wo Sie auf dieser Strecke Kohlenhydrate nehmen — nach ihrem Gelände gesetzt.",
  "connect.chooseSession": "Einheit auswählen",
  "connect.baseMap": "Kartenhintergrund",
  "connect.terrain": "Gelände",
  "connect.weather": "Wetter",
  "connect.planRoute": "Für diese Route planen →",
  "connect.analysisSettings": "Auswertungs-Einstellungen",
  "connect.usingProfile": "Aus Ihrem Profil: {weight} kg · max. HF {maxHr} bpm",
  "connect.bodySignals": "Körperwerte",
  "connect.trainingAnalysis": "Trainingsanalyse",
  "connect.weeklyCarbs": "Kohlenhydrate pro Woche",

  // ---- Route fuelling by terrain -----------------------------------------
  "route.fuelByTerrain": "Verpflegung auf dieser Route",
  "route.chartLabel": "Höhenprofil mit {count} Verpflegungsstopps über {gain} Höhenmeter",
  "route.byTerrain": "nach Gelände gesetzt",
  "route.evenSpacing": "gleichmässige Abstände",
  "route.explain":
    "Die Stopps liegen dort, wo die Energie tatsächlich verbraucht wird: Bergauf kostet pro Meter bis zu 2,5-mal so viel wie flach. Deshalb liegt eine Verpflegung vor dem Anstieg statt mitten darin — und nie tief in einer Abfahrt, wo Essen kaum möglich ist.",

  "route.estimatedProfile":
    "Höhenprofil geschätzt — swisstopo war nicht erreichbar. Der Verlauf ist ungefähr, die Zeitpunkte entsprechend grob.",

  // ---- Session debrief ----------------------------------------------------
  // ---- Shop / Affiliate ---------------------------------------------------
  "shop.orderAt": "Bei {brand} bestellen →",
  "shop.noShop": "Für diese Produkte ist noch kein Shop hinterlegt.",
  "shop.needsApi": "Verbinden Sie die App mit ihrer API, um zu sehen, wo Sie diese bestellen können.",
  "shop.affiliateNote":
    "Sie bestellen bei der Marke. Partner-Bestellungen zahlen uns eine Provision — nie auf Ihre Kosten.",
  "shop.noPartnerNote":
    "Sie bestellen bei der Marke. Mit ihr besteht keine Partnerschaft — wir verdienen hier nichts.",
  "shop.affiliateAmount": "Rund CHF {chf} bei diesem Warenkorb.",

  // ---- Wettkampf- / Routen-Import -----------------------------------------
  "race.title": "Wettkampf oder Route planen",
  "race.intro": "Die GPX-Datei des Veranstalters — als Verpflegungsplan für genau diese Strecke.",
  "race.drop": "GPX-Datei hierher ziehen",
  "race.choose": "Datei auswählen",
  "race.privacy": "Die Datei wird auf Ihrem Gerät gelesen. Weitergegeben wird nur die Streckenlinie — für Gelände und Wetter.",
  "race.noRoute": "In dieser Datei ist keine Route enthalten. GPX-Dateien von Veranstaltern, Strava, Komoot oder swisstopo funktionieren.",
  "race.tooBig": "Diese Datei ist grösser als 8 MB — exportieren Sie die Route ohne Herzfrequenz- und Trittfrequenzdaten.",
  "race.another": "Weitere importieren",
  "race.unnamed": "Importierte Route",
  "race.finishTime": "Angestrebte Zielzeit",
  "race.estimateNote": "Geschätzt aus Distanz und Höhenmetern. Setzen Sie Ihre eigene Zielzeit — der Plan folgt ihr.",
  "race.loadingMap": "Karte wird geladen…",
  "home.planRace": "Wettkampf planen",

  "debrief.title": "Wie diese Einheit lief",
  "debrief.needed": "Diese Route brauchte",
  "debrief.youTook": "Sie nahmen",
  "debrief.short": "{gap} g/h zu wenig",
  "debrief.onTarget": "Im Ziel",
  "debrief.notLogged": "Noch nicht erfasst",
  "debrief.howWasIt": "Wie lief es?",
  "debrief.gut": "Magen",
  "debrief.energy": "Energie",
  "debrief.actualCarbs": "Aufgenommene Kohlenhydrate",
  "debrief.save": "Speichern und Auswertung ansehen",
  "debrief.whereToTake": "Was Sie beim nächsten Mal wo nehmen",
  "debrief.leadToPlan": "Dieselbe Route mit der Verpflegung, die sie gebraucht hätte — was Sie wo nehmen.",
  "debrief.verdictUnderFuelled": "Zu wenig verpflegt",
  "debrief.verdictAboutRight": "Gut verpflegt",
  "debrief.verdictOverGut": "Vom Magen begrenzt",
  "debrief.verdictUnknown": "Zu wenig für ein Urteil",
  "debrief.gi.none": "Gut",
  "debrief.gi.mild": "Etwas flau",
  "debrief.gi.severe": "Schlecht",
  "debrief.energy.bonked": "Eingebrochen",
  "debrief.energy.faded": "Nachgelassen",
  "debrief.energy.steady": "Gleichmässig",
  "debrief.energy.strong": "Stark",
  "finding.underFuelled": "Sie nahmen rund {actual} g/h; die Anstiege dieser Route verlangten {required} g/h — etwa {gap} g/h zu wenig.",
  "finding.aboutRight": "Die Verpflegung passte zu dem, was diese Route verlangte — genau so wieder.",
  "finding.gutLimited": "Hier war Ihr Magen die Grenze, nicht die Menge. Senken Sie die Rate und bauen Sie sie wieder auf, bevor Sie mehr nehmen.",
  "finding.startedLate": "Auch früher beginnen: Die erste Verpflegung gehört in die ersten 30–40 Minuten, nicht erst nach {atMin}.",
  "finding.climbUnfuelled": "Der {gain}-m-Anstieg ab km {km} ist die Stelle, an der diese Lücke zuschlägt — nehmen Sie die Kohlenhydrate schon im Anlauf.",
  "finding.noLog": "Sagen Sie uns, wie es lief — dann zeigen wir Ihnen genau, wo die Verpflegung zu kurz kam.",
  "finding.shortSession": "Unter einer Stunde — die Verpflegung während der Einheit war hier nicht entscheidend.",

  // ---- Catalog & shop -----------------------------------------------------
  "catalog.title": "Produktübersicht",
  "catalog.bestWhen": "Ideal wenn",

  // ---- Profile ------------------------------------------------------------
  "profile.bodyWeight": "Körpergewicht",
  "profile.maxHr": "Maximale Herzfrequenz",
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
  "toast.sessionLogged": "Erfasst — das sagt uns die Einheit.",
  "toast.saveFailed": "Speichern fehlgeschlagen. Bitte erneut versuchen.",

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
