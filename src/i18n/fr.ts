import type { Dictionary } from "./en";

/**
 * French (Swiss usage) — Romandie is roughly a fifth of the Swiss market and
 * was reading an English app until now.
 *
 *  - **Vouvoiement** throughout, matching the German dictionary's "Sie": Swiss
 *    sports brands address customers formally.
 *  - Swiss French numbers and currency (CHF), and the Swiss institution names
 *    kept as they are used locally — swisstopo, MétéoSuisse.
 *
 * Typed as `Dictionary`, so leaving a key out fails the build.
 */
export const fr: Dictionary = {
  // ---- App shell ----------------------------------------------------------
  "app.skipToContent": "Aller au contenu",
  "app.brand": "You Go Further",
  "app.nav": "Navigation principale",
  "app.disclaimer":
    "Conseils généraux pour adultes en bonne santé — pas un avis médical. Les connexions aux services utilisent les autorisations OAuth officielles ; des données d'exemple sont affichées tant qu'aucun compte réel n'est lié.",

  "nav.plan": "Planifier",
  "nav.progress": "Analyse",
  "nav.connect": "Connexions",
  "nav.team": "Équipe",
  "nav.catalog": "Produits",
  "nav.admin": "Administration",
  "nav.more": "Plus",

  // ---- Start screen -------------------------------------------------------
  "nav.home": "Accueil",
  "home.goodMorning": "Bonjour {name}",
  "home.goodAfternoon": "Bon après-midi {name}",
  "home.goodEvening": "Bonsoir {name}",
  "home.doNext": "Votre prochaine étape",
  "home.planSession": "Planifier une séance",
  "home.logSession": "Enregistrer une séance",
  "home.thisWeek": "7 derniers jours",
  "home.sessions": "Séances",
  "home.hours": "Heures",
  "home.distance": "Distance",
  "home.climb": "Dénivelé",
  "home.vsPrevious": "{delta} h par rapport à la semaine précédente",
  "home.firstWeek": "Votre première semaine de données — rien à comparer pour l'instant.",
  "home.quietWeek":
    "Une semaine calme. Le repos fait partie de l'entraînement ; si ce n'était pas prévu, reprenez progressivement.",
  "home.fuelling": "Nutrition",
  "home.notScoredYet": "Pas encore évalué",
  "home.recent": "Séances récentes",
  "home.noSessions": "Aucune séance pour l'instant. Connectez un service et votre entraînement apparaîtra ici.",
  "home.readiness": "Fraîcheur",
  "home.readinessMeasured": "depuis vos appareils",
  "home.readinessSelf": "votre propre estimation",
  "home.longestRecent": "La plus longue récemment",
  "home.fuelIt": "Préparer celle-ci →",
  "home.reviewIt": "Comment ça s'est passé ? →",
  "home.logged": "Enregistrée",
  "home.reviewPending": "{count} séances encore à analyser",
  "home.reviewPending_one": "{count} séance encore à analyser",
  "home.shortcuts": "Vos outils",
  "home.shortcutTeam": "Votre groupe",
  "home.shortcutTeamWhy": "Charge et nutrition des athlètes dont vous vous occupez.",
  "home.shortcutCatalog": "Catalogue de produits",
  "home.shortcutCatalogWhy": "Voir ce que l'algorithme peut recommander et ajouter vos propres produits.",
  "home.shortcutAdmin": "Plateforme",
  "home.shortcutAdminWhy": "Utilisateurs, rôles et réglages de la plateforme.",
  "home.openInsights": "Toutes les analyses →",

  // ---- Account menu -------------------------------------------------------
  "account.menu": "Compte",
  "account.profile": "Profil et santé",
  "account.billing": "Abonnement et facturation",
  "account.connections": "Services connectés",
  "account.switchDemo": "Changer de compte démo",
  "account.signOut": "Se déconnecter",
  "account.streak": "{days} jours d'entraînement d'affilée",
  "account.insightsLink": "Analyse ›",

  // ---- Appearance & language ---------------------------------------------
  "appearance.title": "Apparence",
  "appearance.system": "Système",
  "appearance.light": "Clair",
  "appearance.dark": "Sombre",
  "language.title": "Langue",
  "language.en": "English",
  "language.de": "Deutsch",
  "language.fr": "Français",
  "language.it": "Italiano",

  // ---- Common -------------------------------------------------------------
  "common.of": "sur",
  "common.whyThis": "Pourquoi",

  // ---- Domain option labels ----------------------------------------------
  "goal.general-fitness": "Forme générale",
  "goal.general-fitness.blurb": "Rester en bonne santé et s'entraîner confortablement",
  "goal.endurance-performance": "Performance d'endurance",
  "goal.endurance-performance.blurb": "Aller plus loin et plus vite",
  "goal.race-preparation": "Préparation de course",
  "goal.race-preparation.blurb": "Régler et répéter la nutrition du jour de course",
  "goal.weight-loss": "Perte de poids",
  "goal.weight-loss.blurb": "Perdre de la masse grasse sans sacrifier les séances dures",
  "goal.recovery-focus": "Récupération",
  "goal.recovery-focus.blurb": "Récupérer plus vite entre les séances",

  "activity.running": "Course à pied",
  "activity.trail-running": "Trail",
  "activity.cycling": "Vélo",
  "activity.triathlon": "Triathlon",
  "activity.swimming": "Natation",

  "intensity.easy": "Facile",
  "intensity.moderate": "Modérée",
  "intensity.hard": "Dure",
  "intensity.race": "Course",

  "conditions.cool": "Frais",
  "conditions.temperate": "Tempéré",
  "conditions.hot": "Chaud",

  "sweat.light": "Faible",
  "sweat.average": "Moyenne",
  "sweat.heavy": "Forte",
  "sweat.lightText": "transpiration faible",
  "sweat.averageText": "transpiration moyenne",
  "sweat.heavyText": "transpiration forte",

  // ---- Planner ------------------------------------------------------------
  "plan.goal": "Objectif",
  "plan.activity": "Discipline",
  "plan.intensity": "Intensité",
  "plan.duration": "Durée",
  "plan.conditions": "Conditions",
  "plan.carbPerHour": "Glucides / heure",
  "plan.fluidPerHour": "Liquide / heure",
  "plan.phasePre": "Avant",
  "plan.phaseDuring": "Pendant",
  "plan.phasePost": "Après",

  // ---- Planner (detail) ---------------------------------------------------
  "plan.sessionDetails": "Détails de la séance",
  "plan.carbTotal": "Glucides au total",
  "plan.sodiumPerLitreLong": "Sodium / litre",
  "plan.measured": "mesuré",
  "plan.tunedTo": "Adapté à",
  "plan.editProfile": "Modifier le profil",
  "plan.caffeineOk": "caféine acceptée",
  "plan.measuredSignals": "valeurs mesurées",
  "plan.whyThese": "Pourquoi ceux-ci — composition et association",
  "plan.notes": "Remarques et limites",
  "plan.house": "maison",
  "plan.multiTransportable": "glucides 2:1",
  "plan.showAllCues": "Afficher les {count} rappels",
  "plan.simulate": "Simuler",
  "plan.reset": "Réinitialiser",
  "plan.shopThisPlan": "Commander ce plan",
  "absorb.title": "Plus que votre estomac ne peut absorber",
  "absorb.ceiling": "max ~{ceiling} g/h",
  "absorb.body":
    "Le plan demande {target} g/h, mais ces produits n'en délivrent qu'environ {ceiling} g/h — près de {short} g/h resteraient dans l'estomac au lieu d'atteindre le muscle.",
  "absorb.why":
    "Les glucides traversent la paroi intestinale par des transporteurs, et le glucose sature le sien vers 60 g/h. Le fructose ouvre une seconde voie et porte le plafond à environ 90 g/h. Au-delà, l'excédent attire l'eau dans l'intestin — c'est généralement ce que veut dire « mon estomac s'est bloqué ».",

  "plan.pause": "Pause",
  "plan.replay": "Rejouer",
  "profile.savedLocally": "enregistré sur cet appareil",

  // ---- Insights -----------------------------------------------------------
  "insights.score": "Score de nutrition",
  "insights.sessionsLogged": "{count} séances enregistrées",
  "insights.sessionsLogged_one": "{count} séance enregistrée",
  "insights.doNext": "À faire maintenant",
  "insights.worthAttention": "À surveiller",
  "insights.yourTraining": "Votre entraînement",
  "insights.activities": "Séances",
  "insights.hours": "Heures",
  "insights.longSessions": "Séances longues",
  "insights.logged": "Enregistrées",
  "insights.milestones": "Étapes franchies",
  "insights.noSessions":
    "Aucune séance synchronisée — connectez un service et votre entraînement réel apparaîtra ici.",
  "insights.connectService": "Connecter un service",
  "insights.streak": "{days} jours d'affilée · record {best}",
  "insights.notScored": "Enregistrez une séance et ce score mesurera l'efficacité de votre nutrition.",
  "insights.bandGettingStarted": "Premiers pas",
  "insights.bandBuilding": "En progression",
  "insights.bandSolid": "Solide",
  "insights.bandDialledIn": "Parfaitement réglé",

  // ---- Training load ------------------------------------------------------
  "load.title": "Forme, fatigue et fraîcheur",
  "load.fitness": "Condition",
  "load.fitnessNote": "charge sur 42 jours",
  "load.fatigue": "Fatigue",
  "load.fatigueNote": "charge sur 7 jours",
  "load.form": "Fraîcheur",
  "load.formNote": "condition − fatigue",
  "load.ramp": "Progression",
  "load.rampNote": "par semaine",
  "load.building": "en construction",
  "load.steady": "stable",
  "load.tapering": "en affûtage",
  "load.detraining": "en perte",
  "load.chartLabel": "Condition et fatigue des {days} derniers jours",
  "load.explain":
    "La condition est votre charge d'entraînement moyennée sur six semaines ; la fatigue, la même charge sur une semaine. La fraîcheur est l'écart entre les deux — négatif tant que vous chargez, positif une fois assimilé. Cela a sa place sur un écran de nutrition car chaque état change ce qu'il faut manger : une grosse fatigue rend les glucides et les protéines de récupération urgents, et une progression rapide relève votre plancher hebdomadaire de glucides.",
  "load.explainMonotony":
    "Monotonie {monotony} sur {days} jours actifs — à quel point vos journées se ressemblent. Au-delà de 2, les journées dures n'ont jamais de journée facile pour récupérer, et c'est là que s'accumulent stagnation et maladies.",

  // ---- Fuelling next actions (ids come from the engine) -------------------
  "action.logFirst": "Enregistrez votre prochaine séance",
  "action.logFirst.why":
    "Un seul retour indique au planificateur comment la nutrition a été ressentie — c'est de là que tout le reste apprend.",
  "action.lowerCarbRate": "Baissez l'apport en glucides d'environ 10 g/h, puis remontez",
  "action.lowerCarbRate.why":
    "Vos troubles digestifs vous limitent. L'algorithme a déjà plafonné votre maximum ; remontez par petits paliers sur quelques semaines.",
  "action.addCarbs": "Ajoutez environ 10 g/h de glucides sur les séances de plus de 90 minutes",
  "action.addCarbs.why":
    "Vous faiblissez alors que votre estomac va bien — le signe le plus clair qu'il reste de la marge.",
  "action.measureSweat": "Mesurez votre taux de sudation une fois",
  "action.measureSweat.why":
    "Une séance de 90 minutes suffit et remplace une moyenne de population par votre propre valeur de liquide et de sodium.",
  "action.connectService": "Connectez votre service d'entraînement",
  "action.connectService.why":
    "Les plans utiliseront alors vos séances et votre terrain réels plutôt que ce que vous saisissez.",
  "action.logMore": "Enregistrez encore {count} séances",
  "action.logMore_one": "Enregistrez encore {count} séance",
  "action.logMore.why":
    "À partir de cinq, l'algorithme adapte votre objectif de glucides à votre estomac et à votre énergie.",
  "action.rehearseRace": "Répétez la nutrition de course lors de votre prochaine sortie longue",
  "action.rehearseRace.why":
    "Votre nutrition fonctionne. Le gain restant consiste à la répéter au rythme de course pour que rien ne soit nouveau le jour J.",

  // ---- Connect ------------------------------------------------------------
  "connect.title": "Connexions",
  "connect.connect": "Connecter",
  "connect.disconnect": "Déconnecter",
  "connect.locked": "Verrouillé",
  "connect.route": "Parcours et ravitaillements",
  "connect.withGps": "{count} avec GPS",
  "connect.routeIntro": "Où prendre des glucides sur ce parcours, placé selon son relief.",
  "connect.chooseSession": "Choisir une séance",
  "connect.baseMap": "Fond de carte",
  "connect.terrain": "Relief",
  "connect.weather": "Météo",
  "connect.planRoute": "Planifier ce parcours →",
  "connect.analysisSettings": "Réglages d'analyse",
  "connect.usingProfile": "D'après votre profil : {weight} kg · FC max {maxHr} bpm",
  "connect.bodySignals": "Signaux corporels",
  "connect.trainingAnalysis": "Analyse de l'entraînement",
  "connect.weeklyCarbs": "Glucides par semaine",

  // ---- Route fuelling by terrain -----------------------------------------
  "route.fuelByTerrain": "Nutrition sur ce parcours",
  "route.chartLabel": "Profil altimétrique avec {count} ravitaillements sur {gain} m de dénivelé",
  "route.byTerrain": "placés selon le relief",
  "route.evenSpacing": "espacement régulier",
  "route.explain":
    "Les ravitaillements sont placés là où l'énergie part réellement : monter coûte jusqu'à 2,5× le plat par mètre, donc une prise se situe à l'approche d'une montée plutôt que dedans, et jamais en pleine descente où manger est impraticable.",

  "route.estimatedProfile":
    "Profil altimétrique estimé — swisstopo était injoignable ; la forme est indicative et les horaires des ravitaillements approximatifs.",

  // ---- Race forecast (course simulation) ----------------------------------
  "sim.title": "Jusqu'où va le réservoir",
  "sim.badge.outrun": "le plan ne suffit pas",
  "sim.badge.averted": "le plan tient",
  "sim.badge.covered": "large marge",
  "sim.verdict.outrun":
    "Ce parcours dépasse le plan vers le km {km}. Prenez davantage avant ce point, ou prévoyez une seconde moitié plus lente.",
  "sim.verdict.averted":
    "À l'eau seule, vous êtes à sec vers le km {km}. Avec ce plan, vous terminez avec environ {finishPct}% encore dans le réservoir.",
  "sim.verdict.covered": "Le plan couvre ce parcours — environ {finishPct}% de réserve à l'arrivée.",
  "sim.chartLabel":
    "Glucides restants sur {km} km, avec le plan et à l'eau seule, à {finishPct}% à l'arrivée",
  "sim.fadeLine": "{pct}% — là où l'allure lâche",
  "sim.full": "réservoir plein",
  "sim.withPlan": "Avec le plan",
  "sim.onWater": "À l'eau seule",
  "sim.burn": "Dépense",
  "sim.burnNote": "ce que le parcours exige",
  "sim.intake": "Apport",
  "sim.intakeNote": "ce que le plan fournit",
  "sim.sweat": "Sudation",
  "sim.sweatNote": "liquide à remplacer",
  "sim.finish": "À l'arrivée",
  "sim.finishNote": "restant dans le réservoir",
  "sim.warn.bonk":
    "Même avec le plan, le réservoir descend vers le km {km}. Prenez davantage avant ce point, ou acceptez une seconde moitié plus lente.",
  "sim.warn.bonkAverted":
    "À l'eau seule, vous seriez à sec au km {km}. Le plan vous mène à l'arrivée avec environ {finishPct}% restants.",
  "sim.warn.dehydration":
    "Le déficit hydrique atteint environ {deficitPct}% de la masse corporelle — au-delà de {threshold}%, l'allure en souffre. Buvez {mlPerHour} ml par heure plutôt qu'à la soif.",
  "sim.warn.sodium":
    "Vous perdez environ {lossMg} mg de sodium et n'en remplacez qu'environ {replacedMg} mg. Sur une séance aussi longue, c'est dans cet écart que naissent les crampes.",
  "sim.warn.lateStart":
    "Le premier ravitaillement tombe à {atMin} minutes. Commencer dans les 30–40 premières garde le réservoir plein au lieu de courir après.",
  "sim.warn.gapBeforeClimb":
    "Rien de prévu dans les {km} km avant la montée — la portion la plus dure commence l'estomac vide.",
  "sim.explain":
    "La courbe montre vos réserves de glucides face au coût énergétique propre à ce parcours : une montée les vide deux à trois fois plus vite par mètre que le plat, d'où la chute marquée là où le profil grimpe. La seconde courbe, c'est la même course à l'eau seule — l'écart entre les deux, c'est ce que vous apporte le ravitaillement.",
  "sim.explainHeat":
    "Calculé pour une température ressentie de {feelsLike} °C face à une réserve d'environ {store} g. Cette réserve est une valeur de population pour un muscle et un foie entraînés en endurance, pas une mesure de vous — lisez donc la forme et le kilomètre, pas le dernier chiffre.",

  // ---- Shop / affiliate ---------------------------------------------------
  "shop.orderAt": "Commander chez {brand} →",
  "shop.noShop": "Aucune boutique n'est encore indiquée pour ces produits.",
  "shop.needsApi": "Connectez l'application à son API pour voir où les commander.",
  "shop.affiliateNote":
    "Vous commandez chez la marque. Les commandes partenaires nous versent une commission, jamais à vos frais.",
  "shop.noPartnerNote":
    "Vous commandez chez la marque. Nous n'avons aucun accord avec elle et ne gagnons rien ici.",
  "shop.affiliateAmount": "Environ CHF {chf} sur ce panier.",

  // ---- Race / route import ------------------------------------------------
  "race.title": "Planifier une course ou un parcours",
  "race.intro": "Le GPX de l'organisateur, transformé en plan de nutrition pour ce tracé précis.",
  "race.drop": "Déposez un fichier .gpx ici",
  "race.choose": "Choisir un fichier",
  "race.privacy": "Le fichier est lu sur votre appareil. Seul le tracé est transmis, pour le relief et la météo.",
  "race.noRoute":
    "Aucun parcours trouvé dans ce fichier. Un GPX d'un organisateur, de Strava, de Komoot ou de swisstopo fonctionnera.",
  "race.tooBig":
    "Ce fichier dépasse 8 Mo — exportez le parcours sans les données de fréquence cardiaque ni de cadence.",
  "race.another": "Importer un autre",
  "race.unnamed": "Parcours importé",
  "race.finishTime": "Temps visé",
  "race.estimateNote":
    "Estimé d'après la distance et le dénivelé. Indiquez votre propre objectif — le plan s'y adapte.",
  "race.loadingMap": "Chargement de la carte…",
  "home.planRace": "Planifier une course",

  // ---- Session debrief ----------------------------------------------------
  "debrief.title": "Comment s'est passée cette séance",
  "debrief.needed": "Ce parcours demandait",
  "debrief.youTook": "Vous avez pris",
  "debrief.short": "{gap} g/h de moins",
  "debrief.onTarget": "Dans la cible",
  "debrief.notLogged": "Pas encore enregistrée",
  "debrief.howWasIt": "Comment ça s'est passé ?",
  "debrief.gut": "Estomac",
  "debrief.energy": "Énergie",
  "debrief.actualCarbs": "Glucides pris",
  "debrief.save": "Enregistrer et voir l'analyse",
  "debrief.whereToTake": "Quoi prendre et où, la prochaine fois",
  "debrief.leadToPlan": "Voici le même parcours avec la nutrition qu'il demandait — quoi prendre, et où.",
  "debrief.verdictUnderFuelled": "Sous-alimenté",
  "debrief.verdictAboutRight": "Bien alimenté",
  "debrief.verdictOverGut": "Limité par l'estomac",
  "debrief.verdictUnknown": "Pas assez d'éléments",
  "debrief.gi.none": "Ça allait",
  "debrief.gi.mild": "Un peu dérangé",
  "debrief.gi.severe": "Mauvais",
  "debrief.energy.bonked": "Fringale",
  "debrief.energy.faded": "En baisse",
  "debrief.energy.steady": "Régulier",
  "debrief.energy.strong": "Fort",
  "finding.underFuelled":
    "Vous avez pris environ {actual} g/h ; le dénivelé de ce parcours demandait {required} g/h — soit à peu près {gap} g/h de moins.",
  "finding.aboutRight": "La nutrition correspondait à ce que ce parcours exigeait — refaites la même chose.",
  "finding.gutLimited":
    "C'est votre estomac qui vous a limité, pas la quantité. Réduisez le débit et reconstruisez avant d'en ajouter.",
  "finding.startedLate":
    "Commencez aussi plus tôt : la première prise doit tomber dans les 30 à 40 premières minutes, pas à {atMin}.",
  "finding.climbUnfuelled":
    "La montée de {gain} m à partir du km {km} est l'endroit où ce manque se paie — prenez les glucides dès l'approche la prochaine fois.",
  "finding.noLog": "Dites-nous comment ça s'est passé et nous vous montrerons exactement où la nutrition a manqué.",
  "finding.shortSession":
    "Moins d'une heure — ce ne sont pas les glucides pendant l'effort qui ont décidé de vos sensations.",

  // ---- Catalog & shop -----------------------------------------------------
  "catalog.title": "Catalogue de produits",
  "catalog.bestWhen": "Idéal quand",

  // ---- Profile ------------------------------------------------------------
  "profile.bodyWeight": "Poids corporel",
  "profile.maxHr": "Fréquence cardiaque max",
  "profile.sweatRate": "Taux de sudation",
  "profile.sweatSodium": "Sodium dans la sueur",
  "profile.synced": "synchronisé avec votre compte",

  "profile.yourProfile": "Votre profil",
  "profile.bodyPrefs": "Corps et préférences",
  "profile.sweatLevelShort": "Niveau de sudation",
  "profile.caffeineLong": "Je tolère la caféine — proposez-en pour les efforts longs ou intenses",
  "profile.measuredSignals": "Valeurs corporelles mesurées",
  "profile.syncPlatform": "Synchroniser depuis votre plateforme santé",
  "profile.useMeasuredSignals": "Utiliser mes valeurs mesurées",

  // ---- Auth ---------------------------------------------------------------
  "auth.headline": "Mieux se nourrir, aller plus loin",
  "auth.continueEmail": "Continuer avec un e-mail",
  "auth.sendLink": "Envoyez-moi un lien de connexion",
  "auth.openDevLink": "Ouvrir le lien (messagerie de dev)",

  "auth.subtitle": "Connectez-vous ou créez votre compte pour synchroniser entraînement et nutrition.",
  "auth.continueApple": "Continuer avec Apple",
  "auth.continueGoogle": "Continuer avec Google",
  "auth.signingIn": "Connexion…",
  "auth.sending": "Envoi…",
  "auth.createOrSignIn": "Créer un compte / se connecter",
  "auth.sentTo":
    "Regardez votre boîte de réception — nous avons envoyé un lien de connexion à {email}. Il fonctionne une seule fois et expire dans 15 minutes.",
  "auth.differentAddress": "← utiliser une autre adresse",
  "auth.otherOptions": "← autres options",
  "auth.namePlaceholder": "Votre nom (facultatif)",
  "auth.emailPlaceholder": "vous@exemple.ch",
  "auth.terms": "En continuant, vous acceptez nos conditions.",
  "auth.termsLive":
    "La connexion est vérifiée côté serveur — les jetons sociaux auprès du fournisseur, l'e-mail par un lien à usage unique.",
  "auth.termsDemo": "Sans serveur : la connexion est simulée pour la démo.",
  "auth.exploreDemo": "Découvrir un compte de démonstration",

  "toast.paymentReceived": "Paiement reçu — merci !",
  "toast.planActive": "Votre abonnement {tier} est actif.",
  "toast.connected": "{provider} connecté — vos séances se synchronisent.",
  "toast.planningRoute": "Planification de votre parcours — conditions appliquées",
  "toast.sessionLogged": "Enregistré — voici ce que cela nous apprend.",
  "toast.saveFailed": "Enregistrement impossible. Réessayez.",

  // ---- Nutrition guide ----------------------------------------------------
  "guide.title": "Guide nutrition",
  "guide.inPractice": "En pratique",
  "guide.pitfalls": "Erreurs fréquentes",
  "guide.readMinutes": "{count} min de lecture",
  "guide.englishOnly": "Les articles du guide ne sont pour l'instant disponibles qu'en anglais.",
  "guide.articles": "{count} articles",
  "guide.intro":
    "Les preuves derrière chaque plan — quoi faire, en quelle quantité et pourquoi. Rédigé d'après le consensus scientifique en nutrition sportive.",


};
