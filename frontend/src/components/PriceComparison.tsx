import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { DashboardDetail, ModelPriceComparison, PricingComparison } from "../types";
import { useI18n, type TFunction } from "../i18n";

interface Props {
  detail: DashboardDetail;
}

interface AxisRange {
  low: number;
  high: number;
  avg: number;
}

interface GonkaSplitRange {
  input: AxisRange;
  output: AxisRange;
  brokers: number;
}

interface CompetitorRow {
  key: string;
  provider: string;
  modelId: string;
  inputPerM: number | null;
  outputPerM: number | null;
  isVariant: boolean;
}

interface ModelPricingStats {
  model: ModelPriceComparison;
  gonkaRange: GonkaSplitRange | null;
  cheaperTimes: number | null;
  cheaperLabel: string | null;
  worldInputAverage: number | null;
  worldOutputAverage: number | null;
  gonkaBaseline: { input: number | null; output: number | null };
  competitors: CompetitorRow[];
}

interface TrackDomain {
  min: number;
  max: number;
  ticks: number[];
}

export function PriceComparison({ detail }: Props) {
  const { t, formatDate, formatNumber } = useI18n();
  const [comparison, setComparison] = useState<PricingComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeModelId, setActiveModelId] = useState<string>("");

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
      (comparison?.models ?? []).map((model) =>
        buildModelPricingStats(model, detail, formatNumber)
      ),
    [comparison, detail, formatNumber]
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

  return (
    <section className="page-section price-section">
      <header className="section-header price-header">
        <div>
          <h2>{t("pricing.title")}</h2>
          {!expanded && <p>{t("pricing.hint")}</p>}
        </div>
        {checkedLabel && <span className="price-date">{checkedLabel}</span>}
      </header>

      <div className="price-panel">
        {loading && !comparison ? (
          <div className="price-loading">{t("pricing.loading")}</div>
        ) : error ? (
          <div className="price-error">{error}</div>
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
                        {stats.cheaperLabel && (
                          <em>{stats.cheaperLabel}×</em>
                        )}
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

function ModelPriceVisual({ stats }: { stats: ModelPricingStats }) {
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
        {cheaperLabel && <span className="price-visual-badge">{cheaperLabel}×</span>}
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
            median={outputMedian}
            markers={outputValues.map((value, index) => ({
              id: `out-${index}-${value}`,
              value,
            }))}
          />
          <PriceSpectrum
            label={t("pricing.inputShort")}
            domain={inputDomain}
            gonkaLow={gonkaRange?.input.low ?? null}
            gonkaHigh={gonkaRange?.input.high ?? null}
            median={inputMedian}
            markers={inputValues.map((value, index) => ({
              id: `in-${index}-${value}`,
              value,
            }))}
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
                inputValue={gonkaRange.input.avg}
                outputValue={gonkaRange.output.avg}
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
                title={
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

function PriceSpectrum({
  label,
  domain,
  gonkaLow,
  gonkaHigh,
  median,
  markers,
}: {
  label: string;
  domain: TrackDomain;
  gonkaLow: number | null;
  gonkaHigh: number | null;
  median: number | null;
  markers: Array<{ id: string; value: number }>;
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
            {gonkaStart != null && gonkaEnd != null && (
              <div
                className="price-spectrum-gonka"
                style={{
                  left: `${Math.min(gonkaStart, gonkaEnd)}%`,
                  width: `${Math.max(gonkaEnd - gonkaStart, 0.8)}%`,
                }}
                title={t("pricing.gonkaBrokers")}
              />
            )}
            {medianX != null && (
              <>
                <div className="price-spectrum-median-line" style={{ left: `${medianX}%` }} />
                {median != null && (
                  <span className="price-spectrum-median" style={{ left: `${medianX}%` }}>
                    {t("pricing.visual.median")} {formatUsd(median)}
                  </span>
                )}
              </>
            )}
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="price-spectrum-tick"
                style={{ left: `${toPercent(marker.value, domain.min, domain.max)}%` }}
                title={formatUsd(marker.value)}
              />
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
}: {
  value: number | null;
  domain: TrackDomain;
  gonkaLow: number | null;
  gonkaHigh: number | null;
  tone: "good" | "market";
}) {
  const dotX =
    value != null ? toPercent(value, domain.min, domain.max) : null;
  const gonkaStart = gonkaLow != null ? toPercent(gonkaLow, domain.min, domain.max) : null;
  const gonkaEnd = gonkaHigh != null ? toPercent(gonkaHigh, domain.min, domain.max) : null;

  return (
    <div className={`price-ladder-metric tone-${tone}`}>
      <span className="price-ladder-value">
        {value != null ? formatUsd(value) : "—"}
      </span>
      <div className="price-ladder-track">
        <div className="price-ladder-rail" />
        {gonkaStart != null && gonkaEnd != null && (
          <div
            className="price-ladder-gonka"
            style={{
              left: `${Math.min(gonkaStart, gonkaEnd)}%`,
              width: `${Math.max(gonkaEnd - gonkaStart, 1)}%`,
            }}
          />
        )}
        {dotX != null && (
          <div className={`price-ladder-dot tone-${tone}`} style={{ left: `${dotX}%` }} />
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
  title,
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
  title?: string;
}) {
  return (
    <div className={`price-ladder-row tone-${tone}`} title={title}>
      <span className="price-ladder-name">{label}</span>
      <LadderMetricCell
        value={inputValue}
        domain={inputDomain}
        gonkaLow={gonkaInputLow}
        gonkaHigh={gonkaInputHigh}
        tone={tone}
      />
      <LadderMetricCell
        value={outputValue}
        domain={outputDomain}
        gonkaLow={gonkaOutputLow}
        gonkaHigh={gonkaOutputHigh}
        tone={tone}
      />
    </div>
  );
}

function buildSharedDomain(values: Array<number | null | undefined>): TrackDomain {
  const all = values.filter((value): value is number => value != null && value > 0);
  if (!all.length) {
    return { min: 0.001, max: 10, ticks: [0.001, 0.01, 0.1, 1, 10] };
  }

  const minVal = Math.min(...all);
  const maxVal = Math.max(...all);
  const logMin = Math.floor(Math.log10(Math.max(minVal * 0.8, 1e-6)));
  const logMax = Math.ceil(Math.log10(Math.max(maxVal * 1.25, minVal * 1.05)));
  const ticks: number[] = [];
  for (let exp = logMin; exp <= logMax; exp += 1) {
    ticks.push(10 ** exp);
  }
  return { min: 10 ** logMin, max: 10 ** logMax, ticks };
}

function toPercent(value: number, min: number, max: number) {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logVal = Math.log10(Math.max(value, min));
  if (logMax <= logMin) return 50;
  return Math.min(100, Math.max(0, ((logVal - logMin) / (logMax - logMin)) * 100));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildModelPricingStats(
  model: ModelPriceComparison,
  detail: DashboardDetail,
  formatNumber: (value: number) => string
): ModelPricingStats {
  const gonkaRange = gonkaSplitRangeForModel(detail, model.model_id);
  const competitors = model.competitors
    .map((row) => ({
      key: `${row.provider}-${row.model_id}`,
      provider: row.provider,
      modelId: row.model_id,
      inputPerM: row.input_per_m,
      outputPerM: row.output_per_m,
      isVariant: row.match_type === "variant",
    }))
    .filter((row) => row.inputPerM != null || row.outputPerM != null);

  const worldInputAverage = average(competitors.map((row) => row.inputPerM));
  const worldOutputAverage = average(competitors.map((row) => row.outputPerM));

  let cheaperTimes: number | null = null;
  let cheaperLabel: string | null = null;
  if (gonkaRange) {
    const inputRatio =
      worldInputAverage && gonkaRange.input.avg > 0
        ? worldInputAverage / gonkaRange.input.avg
        : null;
    const outputRatio =
      worldOutputAverage && gonkaRange.output.avg > 0
        ? worldOutputAverage / gonkaRange.output.avg
        : null;
    const ratios = [inputRatio, outputRatio].filter(
      (value): value is number => value != null && value > 1.05
    );
    if (ratios.length) {
      cheaperTimes = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
      cheaperLabel = formatTimesLabel(cheaperTimes, formatNumber);
    }
  }

  return {
    model,
    gonkaRange,
    cheaperTimes,
    cheaperLabel,
    worldInputAverage,
    worldOutputAverage,
    gonkaBaseline: {
      input: gonkaRange?.input.low ?? null,
      output: gonkaRange?.output.low ?? null,
    },
    competitors,
  };
}

function readSplitRates(raw: Record<string, unknown>) {
  if (!raw.pricing_available) return null;
  const output = Number(raw.real_spend_output_per_m ?? raw.real_spend_per_m);
  const input = Number(raw.real_spend_input_per_m ?? raw.real_spend_output_per_m ?? raw.real_spend_per_m);
  if (!Number.isFinite(input) || input <= 0) return null;
  if (!Number.isFinite(output) || output <= 0) return null;
  return { input, output };
}

function gonkaSplitRangeForModel(detail: DashboardDetail, modelId: string): GonkaSplitRange | null {
  const brokerRates: Array<{ input: number; output: number }> = [];

  for (const provider of detail.providers) {
    const modelBlock = provider.models.find((item) => item.model === modelId);
    const modelMetric = modelBlock?.metrics.find((item) => item.key === "real_spend");
    let rates = readSplitRates(modelMetric?.raw ?? {});

    if (!rates) {
      const brokerMetric = provider.metrics.find((item) => item.key === "real_spend");
      rates = readSplitRates(brokerMetric?.raw ?? {});
    }

    if (rates) brokerRates.push(rates);
  }

  if (!brokerRates.length) return null;

  const inputRates = brokerRates.map((item) => item.input).sort((a, b) => a - b);
  const outputRates = brokerRates.map((item) => item.output).sort((a, b) => a - b);
  return {
    input: axisRange(inputRates),
    output: axisRange(outputRates),
    brokers: brokerRates.length,
  };
}

function axisRange(values: number[]): AxisRange {
  return {
    low: values[0],
    high: values[values.length - 1],
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function average(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value != null && value > 0);
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function formatTimesLabel(times: number, formatNumber: (value: number) => string) {
  return times >= 10 ? formatNumber(Math.round(times)) : times.toFixed(1);
}

function formatUsd(value: number) {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function formatUsdRange(low: number, high: number) {
  if (Math.abs(high - low) < 0.0001) return formatUsd(low);
  return `${formatUsd(low)}–${formatUsd(high)}`;
}