import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "../api";
import { useI18n, type TFunction } from "../i18n";
import {
  displayMetricValueCompact,
  sortProvidersForCompare,
} from "../metrics";
import {
  buildModelPricingStats,
  buildSharedDomain,
  formatMultiplier,
  formatUsd,
  formatUsdRange,
  median,
  toPercent,
  type ModelPricingStats,
} from "../pricingStats";
import type { DashboardDetail, MetricBlock, PricingComparison } from "../types";
import { CompareChrome } from "./CompareChrome";
import "../compare.css";

const GONKA_QUICKSTART = "https://gonka.ai/docs/developer/quickstart/";
const START_URL = "/compare/start";

function metricByKey(metrics: MetricBlock[], key: string) {
  return metrics.find((item) => item.key === key);
}

interface CompareTooltip {
  title: string;
  value?: string;
  hint?: string;
}

function CompareHoverTarget({
  className,
  style,
  tooltip,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  tooltip: CompareTooltip;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`price-hover-target compare-hover-target ${className ?? ""}`.trim()}
      style={style}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <div className="price-tooltip compare-tooltip" role="tooltip">
          <strong>{tooltip.title}</strong>
          {tooltip.value ? <span>{tooltip.value}</span> : null}
          {tooltip.hint ? <em>{tooltip.hint}</em> : null}
        </div>
      ) : null}
    </div>
  );
}

function CompareMiniTrack({
  label,
  gonkaLow,
  gonkaHigh,
  gonkaAvg,
  marketMedian,
  t,
}: {
  label: string;
  gonkaLow: number | null;
  gonkaHigh: number | null;
  gonkaAvg: number | null;
  marketMedian: number | null;
  t: TFunction;
}) {
  const domain = buildSharedDomain([gonkaLow, gonkaHigh, gonkaAvg, marketMedian]);
  const bandStyle =
    gonkaLow != null && gonkaHigh != null
      ? {
          left: `${toPercent(gonkaLow, domain.min, domain.max)}%`,
          width: `${Math.max(
            2,
            toPercent(gonkaHigh, domain.min, domain.max) - toPercent(gonkaLow, domain.min, domain.max)
          )}%`,
        }
      : undefined;

  return (
    <div className="compare-mini-row">
      <div className="compare-mini-label">
        <span>{label}</span>
        <span>
          {gonkaAvg != null ? formatUsd(gonkaAvg) : "—"} ·{" "}
          {marketMedian != null ? formatUsd(marketMedian) : "—"}
        </span>
      </div>
      <div className="compare-mini-track">
        {bandStyle && gonkaLow != null && gonkaHigh != null ? (
          <CompareHoverTarget
            className="compare-mini-band-wrap"
            style={bandStyle}
            tooltip={{
              title: t("compare.pricingGonka"),
              value: formatUsdRange(gonkaLow, gonkaHigh),
              hint: t("pricing.inputShort") + " / " + t("pricing.outputShort"),
            }}
          >
            <div className="compare-mini-band" />
          </CompareHoverTarget>
        ) : null}
        {gonkaAvg != null ? (
          <CompareHoverTarget
            className="compare-mini-dot-wrap gonka"
            style={{ left: `${toPercent(gonkaAvg, domain.min, domain.max)}%` }}
            tooltip={{
              title: t("compare.pricingGonka"),
              value: formatUsd(gonkaAvg),
              hint: label,
            }}
          >
            <div className="compare-mini-dot gonka" />
          </CompareHoverTarget>
        ) : null}
        {marketMedian != null ? (
          <CompareHoverTarget
            className="compare-mini-dot-wrap market"
            style={{ left: `${toPercent(marketMedian, domain.min, domain.max)}%` }}
            tooltip={{
              title: t("compare.pricingMarket"),
              value: formatUsd(marketMedian),
              hint: label,
            }}
          >
            <div className="compare-mini-dot market" />
          </CompareHoverTarget>
        ) : null}
      </div>
    </div>
  );
}

function ComparePriceCard({
  stats,
  t,
}: {
  stats: ModelPricingStats;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { model, gonkaRange, cheaperLabel, worldInputAverage, worldOutputAverage, competitors } =
    stats;
  const inputValues = competitors
    .map((row) => row.inputPerM)
    .filter((value): value is number => value != null && value > 0);
  const outputValues = competitors
    .map((row) => row.outputPerM)
    .filter((value): value is number => value != null && value > 0);
  const inputMedian = median(inputValues);
  const outputMedian = median(outputValues);

  const inputDomain = buildSharedDomain([
    gonkaRange?.input.low,
    gonkaRange?.input.high,
    inputMedian,
  ]);
  const outputDomain = buildSharedDomain([
    gonkaRange?.output.low,
    gonkaRange?.output.high,
    outputMedian,
  ]);

  const renderTrack = (
    kind: "input" | "output",
    domain: ReturnType<typeof buildSharedDomain>,
    gonkaLow: number | null,
    gonkaHigh: number | null,
    gonkaAvg: number | null,
    marketMedian: number | null
  ) => {
    const bandStyle =
      gonkaLow != null && gonkaHigh != null
        ? ({
            left: `${toPercent(gonkaLow, domain.min, domain.max)}%`,
            width: `${Math.max(
              2,
              toPercent(gonkaHigh, domain.min, domain.max) - toPercent(gonkaLow, domain.min, domain.max)
            )}%`,
          } satisfies CSSProperties)
        : undefined;

    return (
      <div className="compare-price-row">
        <span className="compare-price-row-label">{kind === "input" ? "In" : "Out"}</span>
        <div className="compare-mini-track">
          {bandStyle && gonkaLow != null && gonkaHigh != null ? (
            <CompareHoverTarget
              className="compare-mini-band-wrap"
              style={bandStyle}
              tooltip={{
                title: t("compare.pricingGonka"),
                value: formatUsdRange(gonkaLow, gonkaHigh),
              }}
            >
              <div className="compare-mini-band" />
            </CompareHoverTarget>
          ) : null}
          {gonkaAvg != null ? (
            <CompareHoverTarget
              className="compare-mini-dot-wrap gonka"
              style={{ left: `${toPercent(gonkaAvg, domain.min, domain.max)}%` }}
              tooltip={{
                title: t("compare.pricingGonka"),
                value: formatUsd(gonkaAvg),
                hint: kind === "input" ? t("pricing.inputShort") : t("pricing.outputShort"),
              }}
            >
              <div className="compare-mini-dot gonka" />
            </CompareHoverTarget>
          ) : null}
          {marketMedian != null ? (
            <CompareHoverTarget
              className="compare-mini-dot-wrap market"
              style={{ left: `${toPercent(marketMedian, domain.min, domain.max)}%` }}
              tooltip={{
                title: t("compare.pricingMarket"),
                value: formatUsd(marketMedian),
                hint: kind === "input" ? t("pricing.inputShort") : t("pricing.outputShort"),
              }}
            >
              <div className="compare-mini-dot market" />
            </CompareHoverTarget>
          ) : null}
        </div>
        <span className="compare-price-row-value">
          {gonkaRange
            ? formatUsdRange(
                kind === "input" ? gonkaRange.input.low : gonkaRange.output.low,
                kind === "input" ? gonkaRange.input.high : gonkaRange.output.high
              )
            : "—"}
        </span>
      </div>
    );
  };

  return (
    <article className="compare-price-card">
      <div className="compare-price-card-top">
        <h3>{model.label || model.model_id}</h3>
        {cheaperLabel ? (
          <span className="compare-price-badge">
            {t("compare.pricingCheaper", { times: cheaperLabel })}
          </span>
        ) : null}
      </div>
      <div className="compare-price-rows">
        {renderTrack(
          "input",
          inputDomain,
          gonkaRange?.input.low ?? null,
          gonkaRange?.input.high ?? null,
          gonkaRange?.input.low ?? null,
          inputMedian
        )}
        {renderTrack(
          "output",
          outputDomain,
          gonkaRange?.output.low ?? null,
          gonkaRange?.output.high ?? null,
          gonkaRange?.output.low ?? null,
          outputMedian
        )}
      </div>
      <p className="compare-price-foot">
        {t("compare.pricingProviders", { count: competitors.length })}
        {worldOutputAverage != null ? ` · market out ${formatUsd(worldOutputAverage)} avg` : ""}
      </p>
    </article>
  );
}

export function ComparePage() {
  const { t, formatDate, formatNumber } = useI18n();
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [comparison, setComparison] = useState<PricingComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getDashboardDetail(), api.getPricingComparison()])
      .then(([dashboard, pricing]) => {
        if (!cancelled) {
          setDetail(dashboard);
          setComparison(pricing);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setComparison(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const providers = useMemo(
    () => (detail ? sortProvidersForCompare(detail.providers) : []),
    [detail]
  );

  const modelStats = useMemo(
    () =>
      (comparison?.models ?? []).map((model) =>
        buildModelPricingStats(model, detail ?? { aggregate: {} as DashboardDetail["aggregate"], providers: [] }, formatNumber)
      ),
    [comparison, detail, formatNumber]
  );

  const heroModel = modelStats[0];
  const averageCheaper = useMemo(() => {
    const times = modelStats
      .map((stats) => stats.cheaperTimes)
      .filter((value): value is number => value != null && value > 1.05);
    if (!times.length) return null;
    const avg = times.reduce((sum, value) => sum + value, 0) / times.length;
    return formatMultiplier(avg, formatNumber);
  }, [modelStats, formatNumber]);

  const uniqueModels = useMemo(() => {
    const map = new Map<string, { label: string; brokerIds: Set<number> }>();
    for (const provider of providers) {
      for (const model of provider.models) {
        const label = model.label || model.model;
        const key = label.trim().toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.brokerIds.add(provider.broker_id);
        } else {
          map.set(key, { label, brokerIds: new Set([provider.broker_id]) });
        }
      }
    }
    return [...map.values()]
      .map(({ label, brokerIds }) => ({
        modelId: label,
        label,
        brokers: brokerIds.size,
      }))
      .sort((a, b) => b.brokers - a.brokers || a.label.localeCompare(b.label));
  }, [providers]);

  const aggregate = detail?.aggregate;
  const checkedAt = comparison?.checked_at
    ? formatDate(comparison.checked_at, { dateStyle: "medium", timeStyle: "short" })
    : null;

  if (loading && !detail) {
    return (
      <CompareChrome>
        <div className="compare-loading">{t("compare.loading")}</div>
      </CompareChrome>
    );
  }

  const heroAccent =
    averageCheaper ??
    (modelStats.some((stats) => stats.cheaperTimes && stats.cheaperTimes > 10) ? "100×+" : "100×+");

  const savingsChips = modelStats
    .filter((stats) => stats.cheaperLabel)
    .map((stats) => ({
      id: stats.model.model_id,
      label: stats.model.label || stats.model.model_id,
      times: stats.cheaperLabel!,
    }));

  return (
    <CompareChrome
      announce={
        <>
          <span className="compare-announce-dot" />
          {t("compare.liveBadge")}
          {checkedAt ? ` · ${t("compare.checkedAt", { date: checkedAt })}` : ""}
        </>
      }
    >

      <section className="compare-hero">
        <div className="compare-hero-inner">
          <div>
            <div className="compare-eyebrow">{t("compare.eyebrow")}</div>
            <h1>
              {t("compare.heroLine1")}
              <br />
              <span className="compare-hero-accent">{heroAccent.includes("×") ? `Cut them ${heroAccent}.` : t("compare.heroLine2")}</span>
            </h1>
            <p className="compare-hero-copy">{t("compare.heroSub")}</p>
            <div className="compare-hero-stat">
              {averageCheaper ? (
                <>
                  <span className="compare-hero-multiplier">{averageCheaper}</span>
                  <span className="compare-hero-stat-label">{t("compare.heroCheaper")}</span>
                </>
              ) : (
                <span className="compare-hero-stat-label">{t("compare.heroCheaperPending")}</span>
              )}
            </div>
            <div className="compare-hero-actions">
              <a className="compare-btn compare-btn-primary" href={START_URL}>
                {t("compare.ctaPrimary")}
              </a>
              <a className="compare-btn compare-btn-ghost" href="/">
                {t("compare.ctaSecondary")}
              </a>
            </div>
          </div>

          {heroModel?.gonkaRange ? (
            <div className="compare-hero-visual">
              <div className="compare-hero-card">
                <div className="compare-hero-card-head">
                  <strong>{heroModel.model.label || heroModel.model.model_id}</strong>
                  <span>{t("compare.perMillion")}</span>
                </div>
                <CompareMiniTrack
                  label={t("pricing.inputShort")}
                  gonkaLow={heroModel.gonkaRange.input.low}
                  gonkaHigh={heroModel.gonkaRange.input.high}
                  gonkaAvg={heroModel.gonkaRange.input.low}
                  marketMedian={median(
                    heroModel.competitors
                      .map((row) => row.inputPerM)
                      .filter((value): value is number => value != null && value > 0)
                  )}
                  t={t}
                />
                <CompareMiniTrack
                  label={t("pricing.outputShort")}
                  gonkaLow={heroModel.gonkaRange.output.low}
                  gonkaHigh={heroModel.gonkaRange.output.high}
                  gonkaAvg={heroModel.gonkaRange.output.low}
                  marketMedian={median(
                    heroModel.competitors
                      .map((row) => row.outputPerM)
                      .filter((value): value is number => value != null && value > 0)
                  )}
                  t={t}
                />
                <div className="compare-mini-legend">
                  <span>
                    <i style={{ background: "var(--cp-deep-green)" }} /> {t("compare.pricingGonka")}
                  </span>
                  <span>
                    <i style={{ background: "var(--cp-coral)" }} /> {t("compare.pricingMarket")}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {savingsChips.length ? (
        <div className="compare-savings-strip">
          <div className="compare-savings-track">
            {[...savingsChips, ...savingsChips].map((chip, index) => (
              <span key={`${chip.id}-${index}`} className="compare-savings-chip">
                {chip.label} · {chip.times}× {t("compare.heroCheaper")}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <section className="compare-stats-band">
        <div className="compare-stats-band-inner">
          <div className="compare-stat">
            <span className="compare-stat-value">{providers.length}</span>
            <span className="compare-stat-label">{t("compare.statsProviders")}</span>
          </div>
          <div className="compare-stat">
            <span className="compare-stat-value">{uniqueModels.length || modelStats.length}</span>
            <span className="compare-stat-label">{t("compare.statsModels")}</span>
          </div>
          <div className="compare-stat">
            <span className="compare-stat-value">
              {aggregate ? `${Math.round(aggregate.api_uptime_pct)}%` : "—"}
            </span>
            <span className="compare-stat-label">{t("compare.statsUptime")}</span>
          </div>
          <div className="compare-stat">
            <span className="compare-stat-value">
              {aggregate?.output_speed_tps
                ? `${Math.round(aggregate.output_speed_tps)} tps`
                : aggregate
                  ? `${aggregate.latency_s}s`
                  : "—"}
            </span>
            <span className="compare-stat-label">
              {aggregate?.output_speed_tps ? t("compare.statsSpeed") : t("compare.statsLatency")}
            </span>
          </div>
        </div>
      </section>

      {modelStats.length ? (
        <section className="compare-section">
          <header className="compare-section-head">
            <h2>{t("compare.pricingTitle")}</h2>
            <p>{t("compare.pricingSub")}</p>
            {checkedAt ? (
              <p className="compare-section-meta">{t("compare.checkedAt", { date: checkedAt })}</p>
            ) : null}
          </header>
          <div className="compare-pricing-grid">
            {modelStats.map((stats) => (
              <ComparePriceCard key={stats.model.model_id} stats={stats} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {providers.length ? (
        <section className="compare-section stone">
          <div className="compare-section-inner">
            <header className="compare-section-head">
              <h2>{t("compare.performanceTitle")}</h2>
              <p>{t("compare.performanceSub")}</p>
            </header>
            <div className="compare-provider-grid">
              {providers.slice(0, 6).map((provider) => {
                const uptime = metricByKey(provider.metrics, "api_uptime");
                const latency = metricByKey(provider.metrics, "latency");
                const speed = metricByKey(provider.metrics, "output_speed");
                return (
                  <article key={provider.broker_id} className="compare-provider-card">
                    <div className="compare-provider-head">
                      <strong>{provider.broker_name}</strong>
                    </div>
                    <div className="compare-provider-metrics">
                      <div className="compare-provider-metric">
                        <span>{t("glance.uptime")}</span>
                        <strong>{uptime ? displayMetricValueCompact(uptime) : "—"}</strong>
                      </div>
                      <div className="compare-provider-metric">
                        <span>{t("glance.latency")}</span>
                        <strong>{latency ? displayMetricValueCompact(latency) : "—"}</strong>
                      </div>
                      <div className="compare-provider-metric">
                        <span>{t("glance.output")}</span>
                        <strong>{speed ? displayMetricValueCompact(speed) : "—"}</strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {uniqueModels.length ? (
        <section className="compare-section">
          <header className="compare-section-head">
            <h2>{t("compare.modelsTitle")}</h2>
            <p>{t("compare.modelsSub")}</p>
          </header>
          <div className="compare-model-grid">
            {uniqueModels.map((model) => (
              <div key={model.modelId} className="compare-model-chip">
                <strong>{model.label}</strong>
                <span>{t("compare.brokers", { count: model.brokers })}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="compare-cta">
        <div className="compare-cta-inner">
          <div>
            <h2>{t("compare.finalTitle")}</h2>
            <p>{t("compare.finalSub")}</p>
          </div>
          <div className="compare-cta-actions">
            <a className="compare-btn compare-btn-primary" href={START_URL}>
              {t("compare.ctaPrimary")}
            </a>
            <a className="compare-btn compare-btn-outline" href={GONKA_QUICKSTART} target="_blank" rel="noreferrer">
              {t("compare.ctaDocs")}
            </a>
            <a className="compare-btn compare-btn-outline" href="/">
              {t("compare.ctaSecondary")}
            </a>
          </div>
        </div>
      </section>
    </CompareChrome>
  );
}
