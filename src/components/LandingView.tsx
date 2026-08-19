import { useMemo } from "react";
import { LoginScreen } from "./LoginScreen";
import { Icon } from "./Icon";
import { NUTRITION_GUIDE, type GuideCategory } from "../content/nutritionGuide";
import { ALL_PROVIDER_IDS } from "../providers";
import { getConfig } from "../config";
import { useT } from "../i18n";
import type { Account } from "../auth";

/**
 * The page a logged-out visitor lands on.
 *
 * Before this, the whole unauthenticated surface was a 400 px sign-in card on
 * an empty background: it asked for an email address without once saying what
 * the thing does. Everyone arriving from a link, a search result or a race
 * programme had to take it on faith.
 *
 * So the card keeps its place — sign-in is still one click from the top of the
 * page, not behind a "get started" that scrolls somewhere — and the rest of the
 * screen answers the question it was silently skipping. The claims below are
 * the product's actual ones, drawn from what the engine really computes and
 * from the guide's real articles rather than written as marketing.
 */
export function LandingView({ onSignedIn, allowDemo }: { onSignedIn: (a: Account) => void; allowDemo: boolean }) {
  const t = useT();
  const config = getConfig();

  /*
   * One article per category, in the guide's own order.
   *
   * Taking the first six would show five Fuelling pieces and a hydration one —
   * an editorial library that looks like a single-subject blog. One per
   * category is the honest preview: it happens to be exactly six, and it shows
   * the breadth that is the reason to have a guide at all.
   */
  const featured = useMemo(() => {
    const seen = new Set<GuideCategory>();
    return NUTRITION_GUIDE.filter((a) => !seen.has(a.category) && seen.add(a.category));
  }, []);

  return (
    <div className="landing">
      {/* ---- Hero: what it is, and the way in ------------------------------ */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="kicker">{t("app.brand")}</p>
            <h1 className="landing-title">{t("landing.title")}</h1>
            <p className="landing-lede">{t("landing.lede")}</p>
            <ul className="landing-proof">
              <li>
                <Icon name="scale" />
                <span>{t("landing.proofBody")}</span>
              </li>
              <li>
                <Icon name="trend" />
                <span>{t("landing.proofLoad")}</span>
              </li>
              <li>
                <Icon name="catalog" />
                <span>{t("landing.proofProducts")}</span>
              </li>
            </ul>
            <p className="landing-neutral">
              {t("landing.providers", { count: ALL_PROVIDER_IDS.length })}
            </p>
          </div>

          {/*
            The sign-in card, unchanged and in the flow rather than under a
            call to action: the shortest path to using the thing is still one
            click from the first screenful.
          */}
          <div className="landing-signin" id="landing-signin">
            <LoginScreen onSignedIn={onSignedIn} allowDemo={allowDemo} />
          </div>
        </div>
      </header>

      {/* ---- Where this sits: measure → decide → supply --------------------- */}
      <section className="landing-section landing-chain-section" aria-labelledby="landing-chain-h">
        <h2 id="landing-chain-h" className="landing-h2">{t("landing.chainTitle")}</h2>
        <p className="landing-sub">{t("landing.chainLede")}</p>
        {/*
          Built from elements rather than drawn as one SVG. Text inside an SVG
          neither wraps nor reflows, so a diagram with German labels in it would
          have to be redrawn per language and would clip on a narrow phone.
          These are boxes and arrows that stack when the room runs out.
        */}
        <ol className="landing-chain">
          <li className="landing-chain-step">
            <span className="landing-chain-role">{t("landing.chainMeasure")}</span>
            <span className="landing-chain-what">{t("landing.chainMeasureWhat")}</span>
          </li>
          <li className="landing-chain-arrow" aria-hidden />
          <li className="landing-chain-step landing-chain-us">
            <span className="landing-chain-role">{t("landing.chainDecide")}</span>
            <span className="landing-chain-what">{t("landing.chainDecideWhat")}</span>
          </li>
          <li className="landing-chain-arrow" aria-hidden />
          <li className="landing-chain-step">
            <span className="landing-chain-role">{t("landing.chainSupply")}</span>
            <span className="landing-chain-what">{t("landing.chainSupplyWhat")}</span>
          </li>
        </ol>
      </section>

      {/* ---- What you actually get ----------------------------------------- */}
      <section className="landing-section" aria-labelledby="landing-offer-h">
        <h2 id="landing-offer-h" className="landing-h2">{t("landing.offerTitle")}</h2>
        <p className="landing-sub">{t("landing.offerLede")}</p>
        <div className="landing-cards">
          <article className="landing-card">
            <span className="landing-card-icon"><Icon name="plan" /></span>
            <h3>{t("landing.offerPlanTitle")}</h3>
            <p>{t("landing.offerPlanBody")}</p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon"><Icon name="session" /></span>
            <h3>{t("landing.offerCuesTitle")}</h3>
            <p>{t("landing.offerCuesBody")}</p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon"><Icon name="route" /></span>
            <h3>{t("landing.offerRouteTitle")}</h3>
            <p>{t("landing.offerRouteBody")}</p>
          </article>
          <article className="landing-card">
            <span className="landing-card-icon"><Icon name="insights" /></span>
            <h3>{t("landing.offerLearnTitle")}</h3>
            <p>{t("landing.offerLearnBody")}</p>
          </article>
        </div>
      </section>

      {/* ---- The graphics: what the engine is actually reasoning about ------ */}
      <section className="landing-section landing-engine" aria-labelledby="landing-engine-h">
        <h2 id="landing-engine-h" className="landing-h2">{t("landing.engineTitle")}</h2>
        <p className="landing-sub">{t("landing.engineLede")}</p>

        <div className="landing-engine-grid">
          <figure className="landing-figure">
            <figcaption className="landing-figure-cap">{t("landing.curveTitle")}</figcaption>
            {/*
              Carbohydrate available through a long session, fuelled against
              water alone. Paths only, no text: an SVG label cannot wrap or be
              translated, so every word here lives in the legend beneath.
              `preserveAspectRatio="none"` is deliberately NOT set — the curve
              keeps its shape at every width instead of shearing.
            */}
            <svg className="landing-curve" viewBox="0 0 320 132" role="img" aria-label={t("landing.curveAlt")}>
              <defs>
                <linearGradient id="ygf-curve-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[26, 56, 86, 116].map((y) => (
                <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="var(--chart-grid)" strokeWidth="1" />
              ))}
              {/* Water alone: the tank empties and the session falls apart. */}
              <path
                d="M0 22 C 60 34, 110 58, 160 82 S 250 116, 320 126"
                fill="none"
                stroke="var(--chart-baseline)"
                strokeWidth="2.5"
                strokeDasharray="5 4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* The line the athlete is trying to stay above. */}
              <line
                x1="0" y1="104" x2="320" y2="104"
                stroke="var(--chart-limit)" strokeWidth="1.5" strokeDasharray="3 5"
                vectorEffect="non-scaling-stroke"
              />
              {/* Fuelled to plan: it dips and is topped back up. */}
              <path d="M0 22 C 60 30, 100 40, 132 34 S 200 48, 232 38 S 292 50, 320 44 L 320 132 L 0 132 Z" fill="url(#ygf-curve-fill)" />
              <path
                d="M0 22 C 60 30, 100 40, 132 34 S 200 48, 232 38 S 292 50, 320 44"
                fill="none"
                stroke="var(--chart-primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* Each feed, on the curve it produced. */}
              {[
                [132, 34],
                [232, 38],
              ].map(([cx, cy]) => (
                <circle key={cx} cx={cx} cy={cy} r="4" fill="var(--chart-stop)" stroke="var(--panel)" strokeWidth="2" />
              ))}
            </svg>
            <ul className="landing-legend">
              <li><span className="landing-swatch landing-swatch-plan" />{t("landing.curveFuelled")}</li>
              <li><span className="landing-swatch landing-swatch-water" />{t("landing.curveWater")}</li>
              <li><span className="landing-swatch landing-swatch-limit" />{t("landing.curveLimit")}</li>
            </ul>
          </figure>

          <figure className="landing-figure">
            <figcaption className="landing-figure-cap">{t("landing.ladderTitle")}</figcaption>
            {/*
              The carbohydrate ladder, straight out of the guide's first
              article. Bars are elements, not an SVG, so the labels wrap and
              translate; the widths are the real numbers against a 90 g/h
              ceiling.
            */}
            <ul className="landing-ladder">
              {/*
                Written out rather than mapped over a list of key names: a key
                assembled at runtime is invisible to the dictionary's dead-key
                check, which is how translations once shipped that nothing
                rendered. Four rows is not enough repetition to be worth it.
              */}
              <li className="landing-ladder-row">
                <span className="landing-ladder-label">{t("landing.ladderShort")}</span>
                <span className="landing-ladder-track"><span className="landing-ladder-fill" style={{ width: "4%" }} /></span>
                <span className="landing-ladder-value">0</span>
              </li>
              <li className="landing-ladder-row">
                <span className="landing-ladder-label">{t("landing.ladderMid")}</span>
                <span className="landing-ladder-track"><span className="landing-ladder-fill" style={{ width: "18%" }} /></span>
                <span className="landing-ladder-value">~15</span>
              </li>
              <li className="landing-ladder-row">
                <span className="landing-ladder-label">{t("landing.ladderLong")}</span>
                <span className="landing-ladder-track"><span className="landing-ladder-fill" style={{ width: "50%" }} /></span>
                <span className="landing-ladder-value">30–60</span>
              </li>
              <li className="landing-ladder-row">
                <span className="landing-ladder-label">{t("landing.ladderUltra")}</span>
                <span className="landing-ladder-track"><span className="landing-ladder-fill" style={{ width: "100%" }} /></span>
                <span className="landing-ladder-value">90</span>
              </li>
            </ul>
            <p className="landing-figure-note">{t("landing.ladderNote")}</p>
          </figure>
        </div>
      </section>

      {/* ---- The guide ------------------------------------------------------ */}
      <section className="landing-section" aria-labelledby="landing-articles-h">
        <h2 id="landing-articles-h" className="landing-h2">{t("landing.articlesTitle")}</h2>
        <p className="landing-sub">{t("landing.articlesLede", { count: NUTRITION_GUIDE.length })}</p>
        <div className="landing-articles">
          {featured.map((a) => (
            <article key={a.id} className="landing-article">
              <span className="guide-cat">{a.category}</span>
              <h3 className="landing-article-title">{a.title}</h3>
              <p className="landing-article-sum">{a.summary}</p>
              <dl className="landing-article-nums">
                {a.keyNumbers.slice(0, 2).map((n) => (
                  <div key={n.label}>
                    <dt>{n.label}</dt>
                    <dd>{n.value}</dd>
                  </div>
                ))}
              </dl>
              <span className="landing-article-read">{t("guide.readMinutes", { count: a.readMinutes })}</span>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Close ---------------------------------------------------------- */}
      <section className="landing-close">
        <h2 className="landing-h2">{t("landing.closeTitle")}</h2>
        <p className="landing-sub">{t("landing.closeBody")}</p>
        <a className="btn btn-primary landing-close-btn" href="#landing-signin">{t("landing.closeCta")}</a>
      </section>

      <footer className="landing-foot">
        {/* Named, because the app holds health-adjacent data and a visitor
            deciding whether to hand any over deserves to see who is asking. */}
        <p className="landing-foot-op">{config.operatorName || t("landing.footNoOperator")}</p>
        <p className="landing-foot-note">{t("landing.footNote")}</p>
      </footer>
    </div>
  );
}
