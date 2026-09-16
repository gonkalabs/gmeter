import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../api";
import type { DashboardDetail, PricingComparison } from "../types";
import {
  buildModelPricingStats,
  buildPriceDetailRows,
  buildPriceSummaryRows,
  buildSharedDomain,
  formatTimesLabel,
  formatUsd,
  formatUsdRange,
  isUnservedCompareModel,
  median,
  toPercent,
  type ModelPricingStats,
  type TrackDomain,
} from "../pricingStats";
import { useI18n, type TFunction } from "../i18n";

interface Props {
  detail: DashboardDetail;
  standalone?: boolean;
}

interface ScaleMarker {
  id: string;
  value: number;
  title: string;
  hint?: string;
  items?: string[];
}

interface PriceTooltipContent {
  title: string;
  value?: string;
  hint?: string;
  items?: string[];
}

export function PriceComparison({ detail, standalone = false }: Props) {
  const { t, formatDate, formatNumber } = useI18n();
  const [comparison, setComparison] = useState<PricingComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [detailExpanded, setDetailExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPricingComparison()
      .then((payload) => {
        if (!cancelled) setComparison(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelStats = useMemo(
    () =>
      (comparison?.models ?? [])
        .filter(
          (model) =>
            !standalone || !isUnservedCompareModel(model.model_id, model.label)
        )
        .map((model) => buildModelPricingStats(model, detail, formatNumber)),
    [comparison, detail, formatNumber, standalone]
  );

  useEffect(() => {
    if (!modelStats.length) return;
    if (!activeModelId || !modelStats.some((stats) => stats.model.model_id === activeModelId)) {
      setActiveModelId(modelStats[0].model.model_id);
    }
  }, [modelStats, activeModelId]);

  const activeStats = modelStats.find((stats) => stats.model.model_id === activeModelId) ?? modelStats[0];

  const averageCheaper = useMemo(() => {
    const times = modelStats
      .map((stats) => stats.cheaperTimes)
      .filter((value): value is number => value != null && value > 1.05);
    if (!times.length) return null;
    const avg = times.reduce((sum, value) => sum + value, 0) / times.length;
    return formatTimesLabel(avg, formatNumber);
  }, [modelStats, formatNumber]);

  const checkedLabel = comparison
    ? t("pricing.checkedAt", {
        date: formatDate(comparison.checked_at, { dateStyle: "medium", timeStyle: "short" }),
      })
    : null;

  const toggleDetail = (modelId: string) => {
    setDetailExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  return (
    <section className={`page-section price-section ${standalone ? "price-section-standalone" : ""}`}>
      <header className="section-header price-header">
        <div>
          {!standalone && <h2>{t("pricing.title")}</h2>}
          <p className={standalone ? "price-standalone-lead" : undefined}>{t("pricing.hint")}</p>
        </div>
        {checkedLabel && <span className="price-date">{checkedLabel}</span>}
      </header>

      <div className={`price-panel ${standalone ? "price-panel-standalone" : ""}`}>
        {loading && !comparison ? (
          <div className="price-loading">{t("pricing.loading")}</div>
        ) : error ? (
          <div className="price-error">{error}</div>
        ) : standalone ? (
          <>
            <div className="price-compare-cards">
              {modelStats.map((stats) => (
                <PriceCompareSummaryCard
                  key={stats.model.model_id}
                  stats={stats}
                  expanded={detailExpanded.has(stats.model.model_id)}
                  onToggle={() => toggleDetail(stats.model.model_id)}
                />
              ))}
            </div>
            <p className="price-footnote">{t("pricing.footnote")}</p>
          </>
        ) : (
          <>
            {!expanded ? (
              <button
                type="button"
                className={`price-collapsed-preview ${averageCheaper ? "tone-good" : ""}`}
                onClick={() => setExpanded(true)}
                aria-expanded={false}
              >
                {averageCheaper && (
                  <div className="price-collapsed-line">
                    <strong>{t("pricing.collapsedSummary", { times: averageCheaper })}</strong>
                  </div>
                )}
                <div className="price-collapsed-line">
                  <p className="price-collapsed-models">
                    {modelStats.map((stats, index) => (
                      <span className="price-collapsed-model" key={stats.model.model_id}>
                        {index > 0 && <span className="price-collapsed-sep">·</span>}
                        {collapsedModelLabel(stats, t)}
                      </span>
                    ))}
                  </p>
                  <PriceExpandAction label={t("pricing.clickToExpand")} expanded={false} />
                </div>
              </button>
            ) : (
              <button
                type="button"
                className="price-collapsed-toggle is-expanded"
                onClick={() => setExpanded(false)}
                aria-expanded
              >
                <span className="price-collapsed-copy">
                  {averageCheaper
                    ? t("pricing.collapsedSummary", { times: averageCheaper })
                    : t("pricing.title")}
                </span>
                <PriceExpandAction label={t("pricing.clickToCollapse")} expanded />
              </button>
            )}

            {expanded && activeStats && (
              <>
                <div className="price-visual-body">
                  <div className="price-model-tabs" role="tablist" aria-label={t("pricing.title")}>
                    {modelStats.map((stats) => (
                      <button
                        key={stats.model.model_id}
                        type="button"
                        role="tab"
                        aria-selected={stats.model.model_id === activeModelId}
                        className={`price-model-tab ${
                          stats.model.model_id === activeModelId ? "is-active" : ""
                        }`}
                        onClick={() => setActiveModelId(stats.model.model_id)}
                      >
                        <span>{stats.model.label}</span>
                        {stats.cheaperLabel && <em>{stats.cheaperLabel}×</em>}
                      </button>
                    ))}
                  </div>

                  <ModelPriceVisual stats={activeStats} />
                </div>
                <p className="price-footnote">{t("pricing.footnote")}</p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function priceTableRowLabel(row: { isGonka: boolean; isOpenRouter?: boolean; label: string }, t: TFunction) {
  if (row.isGonka) return t("pricing.gonkaBrokers");
  if (row.isOpenRouter) return t("pricing.openRouter");
  return row.label;
}

function priceTableRowClass(row: { isGonka: boolean; isOpenRouter?: boolean }) {
  if (row.isGonka) return "is-gonka";
  if (row.isOpenRouter) return "is-openrouter";
  return "";
}

function PriceCompareSummaryCard({
  stats,
  expanded,
  onToggle,
}: {
  stats: ModelPricingStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const rows = useMemo(() => buildPriceSummaryRows(stats), [stats]);
  const competitorCount = rows.filter((row) => !row.isGonka).length;

  return (
    <article className={`price-compare-card ${expanded ? "is-expanded" : ""}`}>
      <header className="price-compare-card-head">
        <div>
          <h3>{stats.model.label}</h3>
          <p>{t("comparePrices.summaryHint", { count: competitorCount })}</p>
        </div>
        <span className="price-compare-card-unit">{t("pricing.usdPerM")}</span>
      </header>

      {rows.length ? (
        <div className="price-compare-table-wrap">
          <table className="price-compare-table">
            <thead>
              <tr>
                <th scope="col">{t("pricing.provider")}</th>
                <th scope="col">{t("pricing.inputShort")}</th>
                <th scope="col">{t("pricing.outputShort")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={priceTableRowClass(row)}>
                  <th scope="row">{priceTableRowLabel(row, t)}</th>
                  <td>{row.inputPerM != null ? formatUsd(row.inputPerM) : "—"}</td>
                  <td>{row.outputPerM != null ? formatUsd(row.outputPerM) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="price-compare-empty">{t("pricing.noExactListing")}</p>
      )}

      <button
        type="button"
        className="price-compare-details-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span>{expanded ? t("comparePrices.hideDetails") : t("comparePrices.showDetails")}</span>
        <svg
          className={`price-expand-icon ${expanded ? "is-expanded" : ""}`}
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {expanded ? (
        <div className="price-compare-details">
          <ModelPriceVisual stats={stats} showMultiplier={false} textOnly />
        </div>
      ) : null}
    </article>
  );
}

function PriceExpandAction({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <span className="price-expand-action">
      <span className="price-expand-label">{label}</span>
      <svg
        className={`price-expand-icon ${expanded ? "is-expanded" : ""}`}
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function collapsedModelLabel(stats: ModelPricingStats, t: TFunction) {
  const { model, cheaperLabel, worldOutputAverage } = stats;
  if (cheaperLabel) {
    return t("pricing.collapsedModelCheaper", { model: model.label, times: cheaperLabel });
  }
  if (worldOutputAverage != null) {
    return t("pricing.collapsedModelWorld", {
      model: model.label,
      price: formatUsd(worldOutputAverage),
    });
  }
  return model.label;
}

function ModelPriceVisual({
  stats,
  showMultiplier = true,
  textOnly = false,
}: {
  stats: ModelPricingStats;
  showMultiplier?: boolean;
  textOnly?: boolean;
}) {
  const { t } = useI18n();
  const { model, gonkaRange, cheaperLabel, competitors } = stats;

  const outputValues = competitors
    .map((row) => row.outputPerM)
    .filter((value): value is number => value != null && value > 0);
  const inputValues = competitors
    .map((row) => row.inputPerM)
    .filter((value): value is number => value != null && value > 0);

  const outputMedian = median(outputValues);
  const inputMedian = median(inputValues);
  const outputDomain = buildSharedDomain([
    ...outputValues,
    gonkaRange?.output.low,
    gonkaRange?.output.high,
  ]);
  const inputDomain = buildSharedDomain([
    ...inputValues,
    gonkaRange?.input.low,
    gonkaRange?.input.high,
  ]);

  const rankedProviders = [...competitors]
    .filter((row) => row.inputPerM != null || row.outputPerM != null)
    .sort((a, b) => (a.outputPerM ?? 0) - (b.outputPerM ?? 0));

  const detailRows = useMemo(() => buildPriceDetailRows(stats), [stats]);

  if (textOnly) {
    return (
      <article className="price-visual-card price-visual-card-table">
        <header className="price-visual-head">
          <div className="price-visual-title-wrap">
            {competitors.length > 0 && (
              <span className="price-visual-count">
                {t("pricing.providerCountLive", { count: competitors.length })}
              </span>
            )}
          </div>
        </header>

        <div className="price-stat-row">
          <StatChip
            label={t("pricing.gonkaBrokers")}
            value={
              gonkaRange
                ? formatUsdRange(gonkaRange.output.low, gonkaRange.output.high)
                : t("pricing.visual.pending")
            }
            tone={gonkaRange ? "good" : "muted"}
            hint={
              gonkaRange
                ? `${t("pricing.inputShort")} ${formatUsdRange(gonkaRange.input.low, gonkaRange.input.high)}`
                : t("pricing.note.gonkaWaiting")
            }
          />
          <StatChip
            label={t("pricing.visual.marketMedianOut")}
            value={outputMedian != null ? formatUsd(outputMedian) : "—"}
            tone="neutral"
            hint={
              inputMedian != null
                ? `${t("pricing.inputShort")} ${formatUsd(inputMedian)}`
                : undefined
            }
          />
          <StatChip
            label={t("pricing.visual.marketSpreadOut")}
            value={
              outputValues.length
                ? formatUsdRange(Math.min(...outputValues), Math.max(...outputValues))
                : "—"
            }
            tone="neutral"
          />
        </div>

        {detailRows.length ? (
          <div className="price-compare-table-wrap price-detail-table-wrap">
            <table className="price-compare-table price-detail-table">
              <thead>
                <tr>
                  <th scope="col">{t("pricing.provider")}</th>
                  <th scope="col">{t("pricing.inputShort")}</th>
                  <th scope="col">{t("pricing.outputShort")}</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.id} className={priceTableRowClass(row)}>
                    <th scope="row">{priceTableRowLabel(row, t)}</th>
                    <td>{row.inputPerM != null ? formatUsd(row.inputPerM) : "—"}</td>
                    <td>{row.outputPerM != null ? formatUsd(row.outputPerM) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="price-visual-empty">{t("pricing.noExactListing")}</p>
        )}
      </article>
    );
  }

  return (
    <article className="price-visual-card">
      <header className="price-visual-head">
        <div className="price-visual-title-wrap">
          <h3 className="price-visual-title">{model.label}</h3>
          {competitors.length > 0 && (
            <span className="price-visual-count">
              {t("pricing.providerCountLive", { count: competitors.length })}
            </span>
          )}
        </div>
        {showMultiplier && cheaperLabel && (
          <span className="price-visual-badge">{cheaperLabel}×</span>
        )}
      </header>

      <div className="price-stat-row">
        <StatChip
          label={t("pricing.gonkaBrokers")}
          value={
            gonkaRange
              ? formatUsdRange(gonkaRange.output.low, gonkaRange.output.high)
              : t("pricing.visual.pending")
          }
          tone={gonkaRange ? "good" : "muted"}
          hint={
            gonkaRange
              ? `${t("pricing.inputShort")} ${formatUsdRange(gonkaRange.input.low, gonkaRange.input.high)}`
              : t("pricing.note.gonkaWaiting")
          }
        />
        <StatChip
          label={t("pricing.visual.marketMedianOut")}
          value={outputMedian != null ? formatUsd(outputMedian) : "—"}
          tone="neutral"
          hint={
            inputMedian != null
              ? `${t("pricing.inputShort")} ${formatUsd(inputMedian)}`
              : undefined
          }
        />
        <StatChip
          label={t("pricing.visual.marketSpreadOut")}
          value={
            outputValues.length
              ? formatUsdRange(Math.min(...outputValues), Math.max(...outputValues))
              : "—"
          }
          tone="neutral"
        />
      </div>

      {competitors.length > 0 ? (
        <>
          <PriceSpectrum
            label={t("pricing.outputShort")}
            domain={outputDomain}
            gonkaLow={gonkaRange?.output.low ?? null}
            gonkaHigh={gonkaRange?.output.high ?? null}
            gonkaBrokers={gonkaRange?.brokers ?? null}
            median={outputMedian}
            markers={buildSpectrumMarkers(competitors, "output", t)}
          />
          <PriceSpectrum
            label={t("pricing.inputShort")}
            domain={inputDomain}
            gonkaLow={gonkaRange?.input.low ?? null}
            gonkaHigh={gonkaRange?.input.high ?? null}
            gonkaBrokers={gonkaRange?.brokers ?? null}
            median={inputMedian}
            markers={buildSpectrumMarkers(competitors, "input", t)}
          />

          <div className="price-ladder-wrap">
            <div className="price-ladder-title">{t("pricing.visual.providerLadder")}</div>
            <div className="price-ladder">
            <div className="price-ladder-head">
              <span>{t("pricing.provider")}</span>
              <span>{t("pricing.inputShort")}</span>
              <span>{t("pricing.outputShort")}</span>
            </div>
            {gonkaRange && (
              <PriceLadderRow
                label={t("pricing.gonkaBrokers")}
                inputValue={gonkaRange.input.low}
                outputValue={gonkaRange.output.low}
                inputDomain={inputDomain}
                outputDomain={outputDomain}
                gonkaInputLow={gonkaRange.input.low}
                gonkaInputHigh={gonkaRange.input.high}
                gonkaOutputLow={gonkaRange.output.low}
                gonkaOutputHigh={gonkaRange.output.high}
                tone="good"
              />
            )}
            {rankedProviders.map((row) => (
              <PriceLadderRow
                key={row.key}
                label={`${row.provider}${row.isVariant ? "*" : ""}`}
                inputValue={row.inputPerM}
                outputValue={row.outputPerM}
                inputDomain={inputDomain}
                outputDomain={outputDomain}
                gonkaInputLow={gonkaRange?.input.low ?? null}
                gonkaInputHigh={gonkaRange?.input.high ?? null}
                gonkaOutputLow={gonkaRange?.output.low ?? null}
                gonkaOutputHigh={gonkaRange?.output.high ?? null}
                tone="market"
                marketHint={
                  row.isVariant
                    ? `${row.modelId} · ${t("pricing.note.marketVariant")}`
                    : t("pricing.note.marketExact")
                }
              />
            ))}
            </div>
          </div>
        </>
      ) : (
        <p className="price-visual-empty">{t("pricing.noExactListing")}</p>
      )}
    </article>
  );
}

function StatChip({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "good" | "neutral" | "muted";
}) {
  return (
    <div className={`price-stat-chip tone-${tone}`}>
      <span className="price-stat-label">{label}</span>
      <strong className="price-stat-value">{value}</strong>
      {hint && <span className="price-stat-hint">{hint}</span>}
    </div>
  );
}

function PriceHoverTarget({
  className,
  style,
  tooltip,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  tooltip: PriceTooltipContent;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`price-hover-target ${className ?? ""}`.trim()}
      style={style}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div className="price-tooltip" role="tooltip">
          <strong>{tooltip.title}</strong>
          {tooltip.value && <span>{tooltip.value}</span>}
          {tooltip.items && (
            <ul className="price-tooltip-list">
              {tooltip.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {tooltip.hint && <em>{tooltip.hint}</em>}
        </div>
      )}
    </div>
  );
}

function buildSpectrumMarkers(
  competitors: ModelPricingStats["competitors"],
  kind: "input" | "output",
  t: TFunction
): ScaleMarker[] {
  const grouped = new Map<
    string,
    { values: number[]; providers: string[]; hasVariant: boolean }
  >();

  competitors.forEach((row) => {
    const value = kind === "input" ? row.inputPerM : row.outputPerM;
    if (value == null) return;

    const priceLabel = formatUsd(value);
    const group = grouped.get(priceLabel) ?? {
      values: [],
      providers: [],
      hasVariant: false,
    };
    group.values.push(value);
    group.providers.push(`${row.provider}${row.isVariant ? "*" : ""}`);
    group.hasVariant ||= row.isVariant;
    grouped.set(priceLabel, group);
  });

  return Array.from(grouped.entries()).map(([priceLabel, group]) => {
    const value = group.values.reduce((sum, item) => sum + item, 0) / group.values.length;
    const providers = Array.from(new Set(group.providers)).sort((a, b) => a.localeCompare(b));
    const multiple = providers.length > 1;

    return {
      id: `${kind}-${priceLabel}`,
      value,
      title: multiple
        ? t("pricing.visual.providersAtPrice", { count: providers.length })
        : providers[0],
      items: multiple ? providers : undefined,
      hint: group.hasVariant
        ? t("pricing.note.marketVariant")
        : multiple
          ? t("pricing.visual.marketProviders")
          : t("pricing.note.marketExact"),
    };
  });
}

function PriceSpectrum({
  label,
  domain,
  gonkaLow,
  gonkaHigh,
  gonkaBrokers,
  median,
  markers,
}: {
  label: string;
  domain: TrackDomain;
  gonkaLow: number | null;
  gonkaHigh: number | null;
  gonkaBrokers: number | null;
  median: number | null;
  markers: ScaleMarker[];
}) {
  const { t } = useI18n();
  const gonkaStart = gonkaLow != null ? toPercent(gonkaLow, domain.min, domain.max) : null;
  const gonkaEnd = gonkaHigh != null ? toPercent(gonkaHigh, domain.min, domain.max) : null;
  const medianX = median != null ? toPercent(median, domain.min, domain.max) : null;

  return (
    <div className="price-spectrum">
      <div className="price-spectrum-row">
        <span className="price-spectrum-label">{label}</span>
        <div className="price-spectrum-scale">
          <span className="price-spectrum-bound is-min">{formatUsd(domain.min)}</span>
          <div className="price-spectrum-track">
            <div className="price-spectrum-rail" />
            {gonkaStart != null && gonkaEnd != null && gonkaLow != null && gonkaHigh != null && (
              <PriceHoverTarget
                className="price-spectrum-gonka-wrap"
                style={{
                  left: `${Math.min(gonkaStart, gonkaEnd)}%`,
                  // Linear scales make Gonka's absolute range tiny — keep a
                  // visible chip while still anchoring the left edge at 0%.
                  width: `${Math.max(gonkaEnd - gonkaStart, 1.5)}%`,
                }}
                tooltip={{
                  title: t("pricing.gonkaBrokers"),
                  value: formatUsdRange(gonkaLow, gonkaHigh),
                  hint: gonkaBrokers
                    ? t("pricing.note.gonkaRange", { count: gonkaBrokers })
                    : t("pricing.note.gonka"),
                }}
              >
                <div className="price-spectrum-gonka" />
              </PriceHoverTarget>
            )}
            {medianX != null && median != null && (
              <>
                <PriceHoverTarget
                  className="price-spectrum-median-wrap"
                  style={{ left: `${medianX}%` }}
                  tooltip={{
                    title: t("pricing.visual.median"),
                    value: formatUsd(median),
                    hint: t("pricing.visual.marketProviders"),
                  }}
                >
                  <div className="price-spectrum-median-line" />
                  <span className="price-spectrum-median">
                    {t("pricing.visual.median")} {formatUsd(median)}
                  </span>
                </PriceHoverTarget>
              </>
            )}
            {markers.map((marker) => (
              <PriceHoverTarget
                key={marker.id}
                className="price-spectrum-tick-wrap"
                style={{ left: `${toPercent(marker.value, domain.min, domain.max)}%` }}
                tooltip={{
                  title: marker.title,
                  value: formatUsd(marker.value),
                  hint: marker.hint,
                  items: marker.items,
                }}
              >
                <div className="price-spectrum-tick" />
              </PriceHoverTarget>
            ))}
          </div>
          <span className="price-spectrum-bound is-max">{formatUsd(domain.max)}</span>
        </div>
      </div>
    </div>
  );
}

function LadderMetricCell({
  value,
  domain,
  gonkaLow,
  gonkaHigh,
  tone,
  dotTooltip,
  gonkaTooltip,
}: {
  value: number | null;
  domain: TrackDomain;
  gonkaLow: number | null;
  gonkaHigh: number | null;
  tone: "good" | "market";
  dotTooltip: PriceTooltipContent;
  gonkaTooltip: PriceTooltipContent | null;
}) {
  const dotX = value != null ? toPercent(value, domain.min, domain.max) : null;
  const gonkaStart = gonkaLow != null ? toPercent(gonkaLow, domain.min, domain.max) : null;
  const gonkaEnd = gonkaHigh != null ? toPercent(gonkaHigh, domain.min, domain.max) : null;

  return (
    <div className={`price-ladder-metric tone-${tone}`}>
      <span className="price-ladder-value">
        {value != null ? formatUsd(value) : "—"}
      </span>
      <div className="price-ladder-track">
        <div className="price-ladder-rail" />
        {gonkaStart != null &&
          gonkaEnd != null &&
          gonkaTooltip &&
          gonkaLow != null &&
          gonkaHigh != null && (
            <PriceHoverTarget
              className="price-ladder-gonka-wrap"
              style={{
                left: `${Math.min(gonkaStart, gonkaEnd)}%`,
                width: `${Math.max(gonkaEnd - gonkaStart, 1)}%`,
              }}
              tooltip={gonkaTooltip}
            >
              <div className="price-ladder-gonka" />
            </PriceHoverTarget>
          )}
        {dotX != null && (
          <PriceHoverTarget
            className="price-ladder-dot-wrap"
            style={{ left: `${dotX}%` }}
            tooltip={dotTooltip}
          >
            <div className={`price-ladder-dot tone-${tone}`} />
          </PriceHoverTarget>
        )}
      </div>
    </div>
  );
}

function PriceLadderRow({
  label,
  inputValue,
  outputValue,
  inputDomain,
  outputDomain,
  gonkaInputLow,
  gonkaInputHigh,
  gonkaOutputLow,
  gonkaOutputHigh,
  tone,
  marketHint,
}: {
  label: string;
  inputValue: number | null;
  outputValue: number | null;
  inputDomain: TrackDomain;
  outputDomain: TrackDomain;
  gonkaInputLow: number | null;
  gonkaInputHigh: number | null;
  gonkaOutputLow: number | null;
  gonkaOutputHigh: number | null;
  tone: "good" | "market";
  marketHint?: string;
}) {
  const { t } = useI18n();

  const gonkaInputTooltip =
    gonkaInputLow != null && gonkaInputHigh != null
      ? {
          title: t("pricing.gonkaBrokers"),
          value: formatUsdRange(gonkaInputLow, gonkaInputHigh),
          hint: t("pricing.inputShort"),
        }
      : null;
  const gonkaOutputTooltip =
    gonkaOutputLow != null && gonkaOutputHigh != null
      ? {
          title: t("pricing.gonkaBrokers"),
          value: formatUsdRange(gonkaOutputLow, gonkaOutputHigh),
          hint: t("pricing.outputShort"),
        }
      : null;

  return (
    <div className={`price-ladder-row tone-${tone}`}>
      <span className="price-ladder-name">{label}</span>
      <LadderMetricCell
        value={inputValue}
        domain={inputDomain}
        gonkaLow={gonkaInputLow}
        gonkaHigh={gonkaInputHigh}
        tone={tone}
        gonkaTooltip={gonkaInputTooltip}
        dotTooltip={{
          title: label,
          value: inputValue != null ? formatUsd(inputValue) : undefined,
          hint: tone === "market" ? marketHint : t("pricing.inputShort"),
        }}
      />
      <LadderMetricCell
        value={outputValue}
        domain={outputDomain}
        gonkaLow={gonkaOutputLow}
        gonkaHigh={gonkaOutputHigh}
        tone={tone}
        gonkaTooltip={gonkaOutputTooltip}
        dotTooltip={{
          title: label,
          value: outputValue != null ? formatUsd(outputValue) : undefined,
          hint: tone === "market" ? marketHint : t("pricing.outputShort"),
        }}
      />
    </div>
  );
}
