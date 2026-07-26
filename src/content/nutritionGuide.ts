/**
 * The nutrition guide — the platform's editorial layer.
 *
 * Every article states the *numbers* an athlete can act on, how to apply them,
 * what commonly goes wrong, and where the guidance comes from. Figures follow
 * mainstream sports-nutrition consensus (the ACSM/AND/DC joint position stand on
 * Nutrition and Athletic Performance, IOC consensus statements, and ISSN position
 * stands); they are general guidance for healthy adults, not medical advice.
 */
export type GuideCategory =
  | "Fuelling"
  | "Supplements"
  | "Everyday eating"
  | "Recovery"
  | "Hydration"
  | "Health";

export interface GuideArticle {
  id: string;
  category: GuideCategory;
  title: string;
  /** One line shown before the article is opened. */
  summary: string;
  /** The actionable core — what to actually do. */
  keyNumbers: { label: string; value: string }[];
  body: string[];
  practice: string[];
  pitfalls: string[];
  /** Where the guidance comes from. */
  evidence: string;
  readMinutes: number;
}

export const NUTRITION_GUIDE: GuideArticle[] = [
  {
    id: "carbs-during",
    category: "Fuelling",
    title: "How many carbs per hour — the ladder",
    summary: "Match carbohydrate intake to how long and how hard you're going, not to habit.",
    keyNumbers: [
      { label: "Under 45 min", value: "none needed" },
      { label: "45–75 min", value: "small amounts / mouth rinse" },
      { label: "1–2.5 h", value: "30–60 g/h" },
      { label: "2.5 h+", value: "up to 90 g/h" },
    ],
    body: [
      "Carbohydrate is the fuel that limits hard endurance work. Your muscles and liver hold roughly 400–600 g of glycogen — one to two hours at race intensity — so on anything long the question is not whether to fuel but how fast you can take it in.",
      "Intake scales with duration rather than distance or sport. Short sessions run comfortably on what you already stored. From about an hour, a modest feed protects the back half. Beyond about two and a half hours, the ceiling on absorption becomes the ceiling on performance, which is where multiple transportable carbohydrates matter.",
      "Intensity matters too: the harder you go, the more of your energy comes from carbohydrate rather than fat, so a two-hour race deserves more fuel than a two-hour easy ride.",
    ],
    practice: [
      "Work in grams per hour, not 'a gel every so often' — read the label and count.",
      "Start fuelling early, within the first 20–30 minutes; you cannot catch up once you are behind.",
      "Spread intake into small, regular feeds rather than one large dose.",
      "For anything over 2.5 h, choose products with a glucose+fructose blend.",
    ],
    pitfalls: [
      "Waiting until you feel empty — by then absorption can't keep up with demand.",
      "Taking race-day amounts you have never practised in training.",
      "Counting only gels and forgetting the carbohydrate in your drink.",
    ],
    evidence: "ACSM/AND/DC joint position stand, Nutrition and Athletic Performance; IOC consensus on nutrition for athletes.",
    readMinutes: 3,
  },
  {
    id: "multiple-transportable",
    category: "Supplements",
    title: "Why 2:1 glucose–fructose lets you absorb more",
    summary: "A single sugar saturates one intestinal transporter at roughly 60 g/h. Two sugars use two routes.",
    keyNumbers: [
      { label: "Glucose alone", value: "~60 g/h ceiling" },
      { label: "Glucose + fructose", value: "~90 g/h" },
      { label: "Typical ratio", value: "2:1 (some products 1:0.8)" },
    ],
    body: [
      "Glucose crosses the intestinal wall through the SGLT1 transporter, which saturates at about 60 g per hour. Push past that and the excess sits in the gut drawing in water — the classic recipe for sloshing, cramping and diarrhoea.",
      "Fructose uses a different transporter (GLUT5). Combining the two opens a second lane, and total absorption rises to roughly 90 g per hour. This is the single most useful thing to look for on a label for long efforts, and it is why the platform requires multi-transportable products whenever your target passes 60 g/h.",
      "Newer formulations use ratios closer to 1:0.8 glucose-to-fructose and some athletes tolerate even higher rates — but those are trained, individual ceilings, not starting points.",
    ],
    practice: [
      "Above 60 g/h, check the label says glucose/maltodextrin *and* fructose.",
      "Blend sources — a drink mix plus a gel usually beats four gels.",
      "Build toward high rates over weeks, not in one session.",
    ],
    pitfalls: [
      "Assuming any gel supports 90 g/h — single-source products do not.",
      "Mixing your drink far stronger than the label to hit a number; concentration slows gastric emptying.",
    ],
    evidence: "Jeukendrup, multiple transportable carbohydrates; ACSM/AND/DC position stand.",
    readMinutes: 3,
  },
  {
    id: "train-the-gut",
    category: "Fuelling",
    title: "Train your gut like you train your legs",
    summary: "Carbohydrate tolerance is adaptable — the intestine upregulates transporters with repeated exposure.",
    keyNumbers: [
      { label: "Adaptation window", value: "2–6 weeks" },
      { label: "Progression", value: "+10 g/h every 1–2 weeks" },
      { label: "Rehearsals before a race", value: "3+ key sessions" },
    ],
    body: [
      "Gastrointestinal distress is one of the most common reasons endurance athletes underperform, and it is largely trainable. Regularly taking carbohydrate during exercise increases intestinal transporter density and improves gastric emptying and comfort.",
      "That means the athlete who practises 90 g/h is a different athlete, physiologically, from the one who tries it for the first time on race morning. 'Nothing new on race day' applies to your stomach more than anything else.",
    ],
    practice: [
      "Pick your long sessions as fuelling rehearsals and use the exact products and rates you'll race with.",
      "Raise the rate in small steps and hold each step for a week or two.",
      "Log how it went — this app's feedback loop lowers your ceiling automatically if you report distress.",
    ],
    pitfalls: [
      "Training fasted or unfuelled all the time and then expecting a high race-day intake to sit well.",
      "Blaming a product when the real problem was an untrained rate or dehydration.",
    ],
    evidence: "Sports-nutrition consensus on gut training; IOC consensus statement.",
    readMinutes: 3,
  },
  {
    id: "pre-session",
    category: "Fuelling",
    title: "The pre-session meal",
    summary: "Top up liver glycogen without leaving food in your stomach at the start.",
    keyNumbers: [
      { label: "Carbohydrate", value: "1–4 g per kg body mass" },
      { label: "Timing", value: "1–4 h before" },
      { label: "Fluid", value: "5–7 ml/kg, 2–4 h before" },
    ],
    body: [
      "Overnight your liver glycogen falls, so a morning session starts partly depleted even if you ate well the day before. A carbohydrate-focused meal restores it.",
      "The size and timing trade off against each other: the closer to the start, the smaller and simpler the meal. Four hours out you can eat a full meal at the top of the range; an hour out, keep it to a small, low-fibre, low-fat snack.",
      "Fat, fibre and large protein portions all slow gastric emptying — useful at dinner, unhelpful before a hard effort.",
    ],
    practice: [
      "70 kg athlete, 3 h before a long race: roughly 140–210 g of carbohydrate.",
      "Favour familiar, low-fibre choices: white bread or rice, banana, sports drink.",
      "Sip fluid steadily rather than drinking a large volume just before the start.",
    ],
    pitfalls: [
      "A high-fibre or high-fat 'healthy' breakfast before a race.",
      "Skipping breakfast for a long session to 'burn more fat' — it mostly costs you quality.",
    ],
    evidence: "ACSM/AND/DC joint position stand; IOC consensus.",
    readMinutes: 3,
  },
  {
    id: "carb-loading",
    category: "Fuelling",
    title: "Carbohydrate loading, the modern way",
    summary: "No depletion phase, no misery — just 36–48 h of high intake with reduced training.",
    keyNumbers: [
      { label: "Intake", value: "10–12 g/kg/day" },
      { label: "Duration", value: "36–48 h" },
      { label: "Worth it above", value: "~90 min continuous racing" },
    ],
    body: [
      "The old week-long depletion-then-load protocol is obsolete. Trained muscle supercompensates with a day or two of high carbohydrate intake and tapered training — no depletion phase needed.",
      "Loading only pays off in events long enough to genuinely deplete glycogen: roughly 90 minutes of continuous hard effort and up. For a 10 km or a one-hour crit, normal eating plus a good pre-race meal is enough.",
      "Expect the scale to rise a kilo or two: glycogen binds water. That is the point, not a problem.",
    ],
    practice: [
      "70 kg athlete: about 700–840 g of carbohydrate per day for two days.",
      "Use low-fibre, energy-dense choices — hitting these numbers on whole grains alone is uncomfortable.",
      "Drinks and sports products are legitimate tools here; solid food alone is hard work.",
    ],
    pitfalls: [
      "Loading for a short race and just starting heavy.",
      "Adding fat and protein on top rather than displacing them with carbohydrate.",
      "Trying it for the first time the week of a goal race.",
    ],
    evidence: "ACSM/AND/DC position stand; Burke et al. on carbohydrate loading protocols.",
    readMinutes: 3,
  },
  {
    id: "sweat-rate",
    category: "Hydration",
    title: "Measure your sweat rate — it's a 90-minute job",
    summary: "Sweat rates vary roughly eightfold between athletes. Population averages will mislead you.",
    keyNumbers: [
      { label: "Typical range", value: "0.3–2.4 L/h" },
      { label: "Keep losses under", value: "2–3% of body mass" },
      { label: "Rehydrate with", value: "1.25–1.5 L per kg lost" },
    ],
    body: [
      "Dehydration beyond about 2–3% of body mass measurably degrades endurance performance, and more so in the heat. But 'drink lots' is bad advice in both directions — overdrinking carries its own risk.",
      "The fix is one measurement. Weigh yourself nude before and after a session of known duration, correcting for what you drank. Each kilogram lost is roughly a litre of sweat.",
      "Repeat it in different conditions: your hot-weather rate can be double your winter rate, which is exactly why this app treats a measured rate as overriding its estimates.",
    ],
    practice: [
      "Sweat rate (L/h) = (pre-weight − post-weight + fluid drunk in kg) ÷ hours.",
      "Test once in cool and once in hot conditions, at a realistic intensity.",
      "Enter the result in Profile → measured body signals so plans use your number.",
    ],
    pitfalls: [
      "Drinking to a fixed schedule that ignores conditions.",
      "Aiming to replace 100% of losses during the session — 60–80% is usually the practical target.",
    ],
    evidence: "ACSM position stand on exercise and fluid replacement.",
    readMinutes: 4,
  },
  {
    id: "sodium",
    category: "Hydration",
    title: "Sodium: who actually needs it, and how much",
    summary: "Sweat sodium varies tenfold. It matters most when you're sweating a lot, for a long time.",
    keyNumbers: [
      { label: "Sweat sodium range", value: "~200–2000 mg/L" },
      { label: "Sports drinks", value: "~300–700 mg/L" },
      { label: "Matters most beyond", value: "2–3 h, or in heat" },
    ],
    body: [
      "Sodium keeps plasma volume up, drives thirst, and helps you retain the fluid you drink. Losses depend on both how much you sweat and how salty your sweat is — and the second varies enormously between people.",
      "For a cool one-hour run, water is fine. For a hot four-hour ride in a heavy, salty sweater, a drink alone rarely covers it and standalone electrolytes earn their place.",
      "The serious risk at the other end is exercise-associated hyponatraemia — drinking large volumes of plain water over many hours, diluting blood sodium. It is rare but dangerous, and it is a reason not to treat 'more fluid' as automatically safer.",
    ],
    practice: [
      "White salt marks on your kit and a salty taste suggest a high sweat-sodium concentration.",
      "In heat or beyond ~2 h, choose a higher-sodium mix or add electrolyte capsules.",
      "If you gain weight during a long event, you are drinking too much — slow down.",
    ],
    pitfalls: [
      "Loading sodium for a cool 45-minute session — it does nothing.",
      "Assuming cramp is always a sodium problem; fatigue and pacing are more common causes.",
    ],
    evidence: "ACSM position stand on fluid replacement; consensus statements on exercise-associated hyponatraemia.",
    readMinutes: 4,
  },
  {
    id: "recovery",
    category: "Recovery",
    title: "Recovery: refuel, repair, rehydrate",
    summary: "How fast you need to recover decides how aggressive your recovery nutrition should be.",
    keyNumbers: [
      { label: "Carbohydrate (rapid)", value: "1.0–1.2 g/kg/h for 4 h" },
      { label: "Protein", value: "0.25–0.3 g/kg per dose" },
      { label: "Fluid", value: "1.25–1.5 L per kg lost" },
    ],
    body: [
      "The urgency of recovery nutrition depends entirely on when you train next. Two sessions in one day, or racing tomorrow, justify aggressive refuelling. If your next session is 24 hours away, hitting your daily totals matters far more than the first hour.",
      "Carbohydrate restores glycogen; protein supplies amino acids for repair and adaptation. Together they recover you faster than either alone, and the protein dose is what makes the difference to muscle.",
      "Rehydration needs more than the weight you lost, because you keep losing fluid in urine and sweat afterwards.",
    ],
    practice: [
      "70 kg athlete needing fast turnaround: ~70–84 g carbohydrate per hour for four hours, plus ~20 g protein.",
      "A recovery shake is convenient, but milk, a sandwich or a proper meal do the same job.",
      "Weigh yourself after hard sessions and drink about 1.5× the deficit over the following hours.",
    ],
    pitfalls: [
      "Obsessing over a 30-minute 'window' while missing daily totals.",
      "Protein-only recovery after a glycogen-depleting session.",
    ],
    evidence: "ACSM/AND/DC position stand; ISSN position stand on nutrient timing.",
    readMinutes: 4,
  },
  {
    id: "protein",
    category: "Everyday eating",
    title: "Protein: daily total beats timing",
    summary: "Endurance athletes need more than sedentary adults — and it's the daily amount that counts.",
    keyNumbers: [
      { label: "Daily", value: "1.2–2.0 g/kg" },
      { label: "Per meal", value: "0.3 g/kg (~20–40 g)" },
      { label: "Spread over", value: "3–5 meals" },
    ],
    body: [
      "Endurance training raises protein needs — for repair, for mitochondrial and enzymatic adaptation, and to protect lean mass when energy intake is restricted.",
      "Distribution matters more than any single post-workout dose: several moderate servings across the day stimulate muscle protein synthesis better than one large hit at dinner.",
      "Needs sit at the higher end during heavy training blocks, when dieting, and for older athletes.",
    ],
    practice: [
      "70 kg athlete: roughly 84–140 g per day, in servings of 20–30 g.",
      "Anchor each meal with a protein source rather than adding a shake to an otherwise low-protein day.",
      "Include a serving before bed on heavy days.",
    ],
    pitfalls: [
      "Very high protein crowding out the carbohydrate that actually fuels training.",
      "Chasing exotic supplements while daily total is well under target.",
    ],
    evidence: "ISSN position stand on protein and exercise; ACSM/AND/DC position stand.",
    readMinutes: 3,
  },
  {
    id: "food-first",
    category: "Everyday eating",
    title: "Food first — and fuel for the work required",
    summary: "Sports products are precision tools for training; the rest of the day is where health is built.",
    keyNumbers: [
      { label: "Hard/long days", value: "6–10 g/kg carbohydrate" },
      { label: "Easy/rest days", value: "3–5 g/kg" },
      { label: "Products", value: "around training, not instead of meals" },
    ],
    body: [
      "Whole foods bring fibre, micronutrients and phytonutrients that no gel supplies. Sports nutrition earns its place where precision, speed of absorption and convenience genuinely matter — immediately before, during and after training.",
      "'Fuel for the work required' means matching carbohydrate to the day in front of you rather than eating the same every day. Hard and long days get generous carbohydrate; easy and rest days can be lower, with protein, vegetables and fats holding steady.",
      "Done well, this supports body composition without compromising the sessions that actually drive adaptation — which is the opposite of cutting carbohydrate indiscriminately.",
    ],
    practice: [
      "Plan carbohydrate around your week's key sessions, then fill the gaps.",
      "Keep protein and vegetables constant; flex the carbohydrate.",
      "Use products deliberately: a drink mix during a three-hour ride is smart; a gel at your desk is not.",
    ],
    pitfalls: [
      "Under-fuelling hard sessions to save calories, then eating more afterwards anyway.",
      "Treating every ride as an excuse for race fuelling.",
    ],
    evidence: "IOC consensus statement; Impey et al. on fuel-for-the-work-required periodisation.",
    readMinutes: 4,
  },
  {
    id: "caffeine",
    category: "Supplements",
    title: "Caffeine: one of the few that clearly works",
    summary: "Well-evidenced, dose-sensitive, and easy to overdo.",
    keyNumbers: [
      { label: "Dose", value: "3–6 mg/kg" },
      { label: "Timing", value: "~60 min before, or late in a long event" },
      { label: "Low dose also works", value: "1–3 mg/kg" },
    ],
    body: [
      "Caffeine reliably improves endurance performance and lowers perceived effort. It is among the small handful of supplements with genuinely strong evidence.",
      "More is not better. Beyond about 6 mg/kg the performance benefit plateaus while jitters, raised heart rate, gut upset and disrupted sleep increase. Many athletes do just as well on 1–3 mg/kg.",
      "Taken late in a long event, a smaller dose can lift the final third — which is why this app only suggests caffeinated products for long or hard sessions, and only if you have opted in.",
    ],
    practice: [
      "70 kg athlete: roughly 210–420 mg at the standard dose — remember coffee counts.",
      "Rehearse it in training; a minority of people simply feel worse on it.",
      "Watch the clock: caffeine has a half-life of about five hours and evening doses cost you sleep.",
    ],
    pitfalls: [
      "Stacking a strong coffee, a pre-workout and caffeinated gels without counting the total.",
      "Using it to paper over chronic under-sleeping or under-fuelling.",
    ],
    evidence: "ISSN position stand on caffeine and exercise performance.",
    readMinutes: 3,
  },
  {
    id: "supplements-evidence",
    category: "Supplements",
    title: "What's actually worth buying",
    summary: "A short evidence-backed list — and a warning about contamination.",
    keyNumbers: [
      { label: "Good evidence", value: "caffeine, creatine, nitrate/beetroot, beta-alanine, bicarbonate" },
      { label: "Situational", value: "iron, vitamin D — only if deficient" },
      { label: "Contamination risk", value: "real; look for third-party testing" },
    ],
    body: [
      "The performance-supplement market is enormous and mostly unimpressive. The short list with credible evidence is genuinely short, and only caffeine and nitrate are broadly relevant to endurance athletes; beta-alanine and bicarbonate target high-intensity efforts of a few minutes.",
      "Micronutrient supplements correct deficiencies — they do not enhance a well-nourished athlete. Test before you supplement, particularly iron, which is harmful in excess.",
      "Contamination is a real risk for anyone subject to anti-doping. Batch-tested products from reputable manufacturers are worth the premium.",
    ],
    practice: [
      "Get the basics right first: energy, carbohydrate, protein, iron and vitamin D status, sleep.",
      "Trial one thing at a time in training so you can tell what actually helped.",
      "Prefer products with third-party batch testing if you compete under anti-doping rules.",
    ],
    pitfalls: [
      "Buying a stack of supplements while chronically under-fuelled.",
      "Supplementing iron without a blood test.",
    ],
    evidence: "IOC consensus statement on dietary supplements and the high-performance athlete.",
    readMinutes: 4,
  },
  {
    id: "iron-vitamin-d",
    category: "Health",
    title: "Iron and vitamin D — the two that catch endurance athletes",
    summary: "The deficiencies most likely to quietly flatten your training, especially through a Swiss winter.",
    keyNumbers: [
      { label: "Higher risk", value: "female, vegetarian, high-volume athletes" },
      { label: "Vitamin D", value: "little skin synthesis Oct–Mar at Swiss latitudes" },
      { label: "Action", value: "test, then treat — don't guess" },
    ],
    body: [
      "Iron deficiency is common in endurance athletes: losses through sweat, gut and (in runners) foot-strike haemolysis combine with raised demand. It shows up as unusual fatigue and flat sessions long before anaemia appears on a standard blood count, so ferritin is the number to ask about.",
      "Vitamin D depends on sunlight on skin, and at Swiss latitudes the sun sits too low from roughly October to March for meaningful synthesis. Deficiency is widespread in winter and affects bone health, muscle function and immunity.",
      "Both are worth testing rather than assuming — and iron in particular should never be supplemented blind, because excess iron is genuinely harmful.",
    ],
    practice: [
      "Ask your doctor for ferritin alongside a full blood count if training feels unusually hard.",
      "Pair plant iron sources with vitamin C; keep tea and coffee away from iron-rich meals.",
      "Discuss winter vitamin D with your doctor, especially if you train mostly indoors or covered up.",
    ],
    pitfalls: [
      "Self-prescribing high-dose iron on the basis of tiredness alone.",
      "Assuming a summer vitamin D level still applies in February.",
    ],
    evidence: "IOC consensus on nutrition for athletes; ACSM/AND/DC position stand. Discuss testing and treatment with your doctor.",
    readMinutes: 4,
  },
  {
    id: "energy-availability",
    category: "Health",
    title: "Low energy availability — the risk behind 'eating clean'",
    summary: "Under-fuelling relative to training harms bone, hormones and performance. It's the one to take seriously.",
    keyNumbers: [
      { label: "Low availability below", value: "~30 kcal/kg fat-free mass/day" },
      { label: "Healthy target", value: "~45 kcal/kg FFM/day" },
      { label: "Affects", value: "all genders" },
    ],
    body: [
      "Energy availability is the energy left for basic physiology after training has taken its share. When it stays too low, the body downregulates: menstrual disruption, lowered testosterone, impaired bone formation, poorer immunity, mood and sleep problems, and — eventually — worse performance, which is usually what finally gets noticed.",
      "This syndrome (RED-S) is not confined to any one group; it affects male and female athletes across sports, and it often develops from well-intentioned 'clean eating' plus rising training load rather than any deliberate restriction.",
      "It is the reason this platform periodises carbohydrate around your sessions rather than simply minimising it, and why weight-loss plans here still fuel the hard and long work.",
    ],
    practice: [
      "Increase food when training load rises — the two must move together.",
      "Treat recurring illness, stress fractures, lost menstrual cycles or stalled progress as warning signs, not badges.",
      "Seek a sports dietitian or physician if several of those appear together.",
    ],
    pitfalls: [
      "Cutting carbohydrate and adding volume at the same time.",
      "Reading persistent fatigue as a need to train harder.",
    ],
    evidence: "IOC consensus statement on Relative Energy Deficiency in Sport (RED-S). If this sounds familiar, speak to a qualified professional.",
    readMinutes: 4,
  },
  {
    id: "gut-comfort",
    category: "Fuelling",
    title: "Race-day gut comfort",
    summary: "Most in-race stomach trouble is predictable — and mostly preventable.",
    keyNumbers: [
      { label: "Affects", value: "30–50% of endurance athletes" },
      { label: "Drink concentration", value: "roughly 6–8% carbohydrate" },
      { label: "Low-fibre window", value: "24–48 h before" },
    ],
    body: [
      "Blood is diverted away from the gut during hard exercise, so digestion is already compromised before anything else goes wrong. Add an untrained intake rate, an over-concentrated drink, dehydration and heat, and distress becomes likely.",
      "Fibre is helpful every other day of your life and unhelpful the day before a race. A short low-fibre, low-residue window reduces gut content without changing anything about your training.",
      "Some athletes with recurring symptoms respond well to a temporary reduction in fermentable carbohydrates (FODMAPs) in the day or two beforehand — worth trialling in training, ideally with a dietitian.",
    ],
    practice: [
      "Mix drinks to label strength; stronger is not better.",
      "Drop high-fibre foods, legumes and large salads for 24–48 h before a goal race.",
      "Stay on top of fluid — dehydration makes gut symptoms markedly worse.",
    ],
    pitfalls: [
      "A brand-new gel handed out at an aid station.",
      "Very high fat or protein intake close to the start.",
    ],
    evidence: "Reviews of exercise-associated gastrointestinal syndrome; IOC consensus.",
    readMinutes: 3,
  },
  {
    id: "heat-altitude",
    category: "Hydration",
    title: "Heat and altitude change the numbers",
    summary: "Both raise carbohydrate use and fluid needs — Swiss racing often involves both.",
    keyNumbers: [
      { label: "Heat acclimation", value: "10–14 days" },
      { label: "Altitude fluid", value: "noticeably higher" },
      { label: "Iron at altitude", value: "check before you go" },
    ],
    body: [
      "In the heat you sweat more, your gut tolerates less, and you rely more on carbohydrate at any given pace. Acclimating over one to two weeks increases sweat rate while lowering sweat sodium, so your fuelling plan should be rechecked after acclimation, not before.",
      "At altitude, respiratory water loss and a blunted thirst response both push fluid needs up, and carbohydrate becomes a more attractive fuel because it needs less oxygen per unit of energy. Appetite is often suppressed at exactly the moment intake should rise.",
      "This is why the app pulls the actual forecast and the terrain profile for your route — a hot climb is a different fuelling problem from a cool flat run of the same duration.",
    ],
    practice: [
      "Re-measure your sweat rate after a heat block; it will have changed.",
      "At altitude, drink to a plan rather than to thirst, and keep carbohydrate up despite low appetite.",
      "Check iron status before an altitude camp — red-cell production demands it.",
    ],
    pitfalls: [
      "Carrying winter fluid habits into a summer race.",
      "Assuming a cool valley forecast applies 1500 m higher up.",
    ],
    evidence: "IOC consensus statements on nutrition for athletes in hot and altitude environments.",
    readMinutes: 4,
  },
];

export const GUIDE_CATEGORIES: GuideCategory[] = [
  "Fuelling",
  "Hydration",
  "Recovery",
  "Supplements",
  "Everyday eating",
  "Health",
];

export const GUIDE_DISCLAIMER =
  "General guidance for healthy adults, based on mainstream sports-nutrition consensus — not medical advice. " +
  "Speak to a doctor or sports dietitian about supplements, blood tests, or any persistent symptom.";
