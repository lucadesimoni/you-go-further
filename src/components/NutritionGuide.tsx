import { useEffect, useMemo, useState } from "react";
import {
  GUIDE_CATEGORIES,
  GUIDE_DISCLAIMER,
  NUTRITION_GUIDE,
  type GuideArticle,
  type GuideCategory,
} from "../content/nutritionGuide";
import { useI18n } from "../i18n";

/**
 * The nutrition knowledge base — a reading section, not a panel.
 *
 * It used to sit as one collapsed accordion three panels down the Insights
 * screen: sixteen articles of real editorial work, presented as a footnote to a
 * chart. Two things follow from giving it its own place.
 *
 * **An index and an article are different screens.** A list of sixteen
 * expandable rows is a list you scan and then lose your place in; a grid of
 * cards is something you browse, and an article you have chosen deserves the
 * whole width, one column of comfortable measure, and nothing else competing.
 *
 * **A search box, because sixteen is past the number you scan.** An athlete
 * arrives with a question — "sodium", "cramp", "carb loading" — not with a
 * category in mind. It matches titles, summaries and the article body, so the
 * answer is findable by the word the athlete would use.
 */
export function NutritionGuide() {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState<GuideCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const articles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NUTRITION_GUIDE.filter((a) => category === "all" || a.category === category).filter((a) => {
      if (!q) return true;
      // The body too: someone searching "cramp" should find the article that
      // explains cramp even when the title is about sodium.
      const haystack = [a.title, a.summary, a.category, ...a.body, ...a.practice, ...a.pitfalls].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [category, query]);

  const open = openId ? NUTRITION_GUIDE.find((a) => a.id === openId) ?? null : null;

  // Opening an article from halfway down the index should start at the top of
  // it, the way following a link does — and going back should not dump the
  // reader at the top of the index either, but that is a smaller sin.
  useEffect(() => {
    if (openId) window.scrollTo({ top: 0, behavior: "auto" });
  }, [openId]);

  if (open) return <Article article={open} onBack={() => setOpenId(null)} />;

  return (
    <main className="guide">
      <header className="guide-masthead">
        <p className="kicker">{t("guide.kicker")}</p>
        <h1>{t("guide.title")}</h1>
        <p className="guide-count">{t("guide.articles", { count: NUTRITION_GUIDE.length })}</p>
        <p className="guide-lead">{t("guide.intro")}</p>
        {/* The articles themselves are English in both languages; say so rather
            than letting a German reader wonder whether something is broken. */}
        {lang !== "en" && <p className="guide-englishonly">{t("guide.englishOnly")}</p>}
      </header>

      <div className="guide-controls">
        <label className="guide-search">
          <SearchGlyph />
          <input
            type="search"
            value={query}
            placeholder={t("guide.searchPlaceholder")}
            aria-label={t("guide.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="guide-filters" role="group" aria-label={t("guide.filterByTopic")}>
          <button
            type="button"
            className={`health-chip${category === "all" ? " on" : ""}`}
            onClick={() => setCategory("all")}
          >
            {t("guide.allTopics")}
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
      </div>

      {articles.length === 0 ? (
        <p className="detail guide-empty">{t("guide.noMatches", { query: query.trim() })}</p>
      ) : (
        <div className="guide-grid">
          {articles.map((a) => (
            <article key={a.id} className="guide-card">
              <button type="button" className="guide-card-hit" onClick={() => setOpenId(a.id)}>
                <span className="guide-cat">{a.category}</span>
                <h2 className="guide-card-title">{a.title}</h2>
                <p className="guide-card-summary">{a.summary}</p>
                <span className="guide-card-foot">
                  <span className="guide-read">{t("guide.readMinutes", { count: a.readMinutes })}</span>
                  {/* The first number is the reason to open it: an article that
                      leads with "up to 90 g/h" is answering something. */}
                  {a.keyNumbers[0] && (
                    <span className="guide-card-figure">
                      {a.keyNumbers[0].label} · <strong>{a.keyNumbers[0].value}</strong>
                    </span>
                  )}
                </span>
              </button>
            </article>
          ))}
        </div>
      )}

      <p className="guide-disclaimer">{GUIDE_DISCLAIMER}</p>
    </main>
  );
}

/** One article, given the whole screen and a readable measure. */
function Article({ article, onBack }: { article: GuideArticle; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <main className="guide guide-reading">
      <button type="button" className="link-btn guide-back" onClick={onBack}>
        ← {t("guide.backToIndex")}
      </button>

      <article className="guide-article-full">
        <header className="guide-article-head">
          <span className="guide-cat">{article.category}</span>
          <h1>{article.title}</h1>
          <p className="guide-lead">{article.summary}</p>
          <p className="guide-read">{t("guide.readMinutes", { count: article.readMinutes })}</p>
        </header>

        {/* The numbers first. An athlete who reads nothing else should still
            leave with the figure they came for. */}
        <dl className="guide-numbers">
          {article.keyNumbers.map((n) => (
            <div className="guide-number" key={n.label}>
              <dt>{n.label}</dt>
              <dd>{n.value}</dd>
            </div>
          ))}
        </dl>

        <div className="guide-body">
          {article.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="guide-cols">
          <div className="guide-col">
            <h3 className="guide-sub good">{t("guide.inPractice")}</h3>
            <ul>
              {article.practice.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="guide-col">
            <h3 className="guide-sub warn">{t("guide.pitfalls")}</h3>
            <ul>
              {article.pitfalls.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="guide-evidence">
          <strong>{t("guide.evidence")}</strong> {article.evidence}
        </p>
      </article>

      <p className="guide-disclaimer">{GUIDE_DISCLAIMER}</p>
    </main>
  );
}

/** A magnifier — the one symbol a search field never has to explain. */
function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}
