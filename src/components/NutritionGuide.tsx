import { useMemo, useState } from "react";
import {
  GUIDE_CATEGORIES,
  GUIDE_DISCLAIMER,
  NUTRITION_GUIDE,
  type GuideCategory,
} from "../content/nutritionGuide";
import { useI18n } from "../i18n";

/**
 * The nutrition knowledge base. Each article leads with the numbers an athlete
 * can act on, then how to apply them, what usually goes wrong, and the evidence
 * behind it — filterable, and collapsed by default so it stays scannable.
 */
export function NutritionGuide() {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState<GuideCategory | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  const articles = useMemo(
    () => (category === "all" ? NUTRITION_GUIDE : NUTRITION_GUIDE.filter((a) => a.category === category)),
    [category],
  );

  return (
    <section className="panel">
      <div className="section-head">
        <h2>{t("guide.title")}</h2>
        <span className="pill">{t("guide.articles", { count: NUTRITION_GUIDE.length })}</span>
      </div>
      <p className="detail">{t("guide.intro")}</p>
      {/* The articles themselves are English in both languages; say so rather
          than letting a German reader wonder whether something is broken. */}
      {lang === "de" && <p className="detail">{t("guide.englishOnly")}</p>}

      <div className="guide-filters" role="group" aria-label={t("guide.filterByTopic")}>
        <button
          type="button"
          className={`health-chip${category === "all" ? " on" : ""}`}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        {GUIDE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`health-chip${category === c ? " on" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="guide-list">
        {articles.map((a) => {
          const isOpen = open === a.id;
          return (
            <article key={a.id} className={`guide-article${isOpen ? " open" : ""}`}>
              <button
                type="button"
                className="guide-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : a.id)}
              >
                <span className="guide-head-text">
                  <span className="guide-cat">{a.category}</span>
                  <span className="guide-title">{a.title}</span>
                  <span className="guide-body">{a.summary}</span>
                </span>
                <span className="guide-meta">
                  <span className="guide-read">{t("guide.readMinutes", { count: a.readMinutes })}</span>
                  <span className="guide-chevron" aria-hidden>
                    {isOpen ? "▾" : "▸"}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="guide-content">
                  <dl className="guide-numbers">
                    {a.keyNumbers.map((n) => (
                      <div className="guide-number" key={n.label}>
                        <dt>{n.label}</dt>
                        <dd>{n.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {a.body.map((p, i) => (
                    <p className="guide-para" key={i}>
                      {p}
                    </p>
                  ))}

                  <div className="guide-cols">
                    <div className="guide-col">
                      <h4 className="guide-sub good">{t("guide.inPractice")}</h4>
                      <ul>
                        {a.practice.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="guide-col">
                      <h4 className="guide-sub warn">{t("guide.pitfalls")}</h4>
                      <ul>
                        {a.pitfalls.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="guide-evidence">
                    <strong>{t("guide.evidence")}</strong> {a.evidence}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="guide-disclaimer">{GUIDE_DISCLAIMER}</p>
    </section>
  );
}
