/**
 * Editorial nutrition guidance — the "learn" layer of the platform. Short,
 * evidence-based cards on getting fuelling and everyday eating right, so the
 * insights screen educates rather than gamifies. Curated content, not user data.
 */
export interface GuideCard {
  category: "Fuelling" | "Supplements" | "Everyday eating" | "Recovery" | "Hydration";
  title: string;
  body: string;
}

export const NUTRITION_GUIDE: GuideCard[] = [
  {
    category: "Everyday eating",
    title: "Food first, products second",
    body: "Build your base from whole foods — wholegrains, vegetables, quality protein and healthy fats. Sports products earn their place around training, where precision and convenience matter; they don't replace a balanced plate.",
  },
  {
    category: "Fuelling",
    title: "Match carbs to the effort",
    body: "Short and easy runs on water are fine. From ~60–90 minutes, aim for 30–60 g of carbohydrate per hour, and only push toward 90 g/h for long, hard sessions you've trained for.",
  },
  {
    category: "Supplements",
    title: "Multiple transportable carbs",
    body: "Beyond ~60 g/h the gut needs glucose + fructose (a 2:1 blend) to absorb it without distress. It's the single most useful thing to look for on a drink-mix or gel label for long efforts.",
  },
  {
    category: "Supplements",
    title: "Train your gut",
    body: "Carbohydrate tolerance is trainable. Rehearse your race-day intake in training and build the rate gradually over weeks — 'nothing new on race day' applies to your stomach too.",
  },
  {
    category: "Hydration",
    title: "Sodium when it counts",
    body: "In the heat or if you're a heavy, salty sweater, a drink alone rarely covers sodium losses. Add a standalone electrolyte — but on cool, easy days plain water is usually enough.",
  },
  {
    category: "Recovery",
    title: "The 60-minute window",
    body: "After demanding sessions — and especially before another within 24 h — combine carbohydrate and protein within about an hour, and replace fluids at roughly 1.5× what you lost.",
  },
  {
    category: "Supplements",
    title: "Caffeine, used deliberately",
    body: "A moderate dose in the back third of a long or hard effort can help, if you tolerate it. Keep it intentional rather than constant, and skip it on easy days.",
  },
  {
    category: "Everyday eating",
    title: "Fuel the work, not the rest",
    body: "Periodise carbohydrate toward your hard and long sessions; keep easy days lighter. It supports body composition without compromising the training that actually matters.",
  },
];
