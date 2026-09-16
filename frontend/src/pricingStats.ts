import type { DashboardDetail, ModelPriceComparison } from "./types";

/** GLM-5.2 is optional and currently unserved on the network — keep it off /compare. */
export function isUnservedCompareModel(modelId: string, label = ""): boolean {
  const hay = `${modelId} ${label}`.toLowerCase();
  return hay.includes("glm-5.2") || hay.includes("glm 5.2");
}

export function dashboardDetailForCompare(detail: DashboardDetail): DashboardDetail {
  return {
    ...detail,
    network_models: (detail.network_models ?? []).filter(
      (item) => !isUnservedCompareModel(item.model_id, item.label)
    ),
    network_notice: stripUnservedCompareNotice(detail.network_notice),
  };
}

function stripUnservedCompareNotice(notice: string | null | undefined): string | null | undefined {
  if (!notice) return notice;
  return notice
    .replace(/\s*GLM-5\.2 FP8[^.]*\./g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface AxisRange {
  low: number;
  high: number;
  avg: number;
}

export interface GonkaSplitRange {
  input: AxisRange;
  output: AxisRange;
  brokers: number;
}

export interface CompetitorRow {
  key: string;
  provider: string;
  modelId: string;
  inputPerM: number | null;
  outputPerM: number | null;
  isVariant: boolean;
}

export interface ModelPricingStats {
  model: ModelPriceComparison;
  gonkaRange: GonkaSplitRange | null;
  cheaperTimes: number | null;
  cheaperLabel: string | null;
  worldInputAverage: number | null;
  worldOutputAverage: number | null;
  gonkaBaseline: { input: number | null; output: number | null };
  competitors: CompetitorRow[];
}

export interface TrackDomain {
  min: number;
  max: number;
  ticks: number[];
}

function readSplitRates(raw: Record<string, unknown>) {
  if (!raw.pricing_available) return null;
  const output = Number(raw.real_spend_output_per_m ?? raw.real_spend_per_m);
  const input = Number(raw.real_spend_input_per_m ?? raw.real_spend_output_per_m ?? raw.real_spend_per_m);
  if (!Number.isFinite(input) || input <= 0) return null;
  if (!Number.isFinite(output) || output <= 0) return null;
  return { input, output };
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

export function gonkaSplitRangeForModel(
  detail: DashboardDetail,
  modelId: string
): GonkaSplitRange | null {
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

export function buildModelPricingStats(
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
      worldInputAverage && gonkaRange.input.low > 0
        ? worldInputAverage / gonkaRange.input.low
        : null;
    const outputRatio =
      worldOutputAverage && gonkaRange.output.low > 0
        ? worldOutputAverage / gonkaRange.output.low
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

export function buildSharedDomain(values: Array<number | null | undefined>): TrackDomain {
  const all = values.filter((value): value is number => value != null && value > 0);
  if (!all.length) {
    return { min: 0.001, max: 10, ticks: [0.001, 0.01, 0.1, 1, 10] };
  }

  const minVal = Math.min(...all);
  const maxVal = Math.max(...all);
  // Keep the floor at the cheapest real price so a Gonka low of $0.0001 starts
  // at 0% on the track. Cap the ceiling on a readable power-of-ten bound.
  const logMax = Math.ceil(Math.log10(Math.max(maxVal * 1.05, minVal * 1.05)));
  const max = Math.max(10 ** logMax, maxVal);
  const min = minVal;
  const ticks: number[] = [];
  const logMin = Math.floor(Math.log10(Math.max(min, 1e-9)));
  for (let exp = logMin; exp <= logMax; exp += 1) {
    const tick = 10 ** exp;
    if (tick >= min * 0.999 && tick <= max * 1.001) ticks.push(tick);
  }
  if (!ticks.length) ticks.push(min, max);
  return { min, max, ticks };
}

/** Linear mapping — log scales pinned market prices near the right edge. */
export function toPercent(value: number, min: number, max: number) {
  if (max <= min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function formatTimesLabel(times: number, formatNumber: (value: number) => string) {
  return times >= 10 ? formatNumber(Math.round(times)) : times.toFixed(1);
}

export interface PriceSummaryRow {
  id: string;
  label: string;
  inputPerM: number | null;
  outputPerM: number | null;
  isGonka: boolean;
  isOpenRouter?: boolean;
}

const TRACKED_COMPETITOR_PATTERNS: Array<{ patterns: string[] }> = [
  { patterns: ["chute"] },
  { patterns: ["replicate"] },
  { patterns: ["nebius"] },
];

function providerMatches(provider: string, patterns: string[]): boolean {
  const normalized = provider.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function findTrackedCompetitors(competitors: CompetitorRow[]): CompetitorRow[] {
  const found: CompetitorRow[] = [];
  const usedKeys = new Set<string>();

  for (const tracked of TRACKED_COMPETITOR_PATTERNS) {
    const matches = competitors.filter(
      (row) =>
        !usedKeys.has(row.key) &&
        row.outputPerM != null &&
        row.outputPerM > 0 &&
        providerMatches(row.provider, tracked.patterns)
    );
    if (!matches.length) continue;
    const best = matches.sort((a, b) => (b.outputPerM ?? 0) - (a.outputPerM ?? 0))[0];
    found.push(best);
    usedKeys.add(best.key);
  }

  return found;
}

/** Tracked providers when listed, then top most-expensive others (max `limit` rows). */
export function pickTopCompetitorsByPrice(competitors: CompetitorRow[], limit = 5): CompetitorRow[] {
  const tracked = findTrackedCompetitors(competitors);
  const trackedKeys = new Set(tracked.map((row) => row.key));
  const rest = competitors.filter(
    (row) =>
      !trackedKeys.has(row.key) && row.outputPerM != null && row.outputPerM > 0
  );
  const fillCount = Math.max(0, limit - tracked.length);
  const filled = rest
    .sort((a, b) => (b.outputPerM ?? 0) - (a.outputPerM ?? 0))
    .slice(0, fillCount);

  return [...tracked, ...filled].sort((a, b) => (a.outputPerM ?? 0) - (b.outputPerM ?? 0));
}

/** OpenRouter model-card floor price from /api/v1/models (matches openrouter.ai listing). */
export function openRouterCheapest(stats: ModelPricingStats): PriceSummaryRow | null {
  const cardInput = stats.model.openrouter_card_input_per_m;
  const cardOutput = stats.model.openrouter_card_output_per_m;
  if (cardOutput != null && cardOutput > 0) {
    return {
      id: "openrouter",
      label: "OpenRouter",
      inputPerM: cardInput,
      outputPerM: cardOutput,
      isGonka: false,
      isOpenRouter: true,
    };
  }

  const valid = stats.competitors.filter((row) => row.outputPerM != null && row.outputPerM > 0);
  if (!valid.length) return null;

  const cheapest = [...valid].sort((a, b) => (a.outputPerM ?? 0) - (b.outputPerM ?? 0))[0];
  return {
    id: "openrouter",
    label: "OpenRouter",
    inputPerM: cheapest.inputPerM,
    outputPerM: cheapest.outputPerM!,
    isGonka: false,
    isOpenRouter: true,
  };
}

export function buildPriceSummaryRows(stats: ModelPricingStats, limit = 5): PriceSummaryRow[] {
  const rows: PriceSummaryRow[] = [];
  const gonkaOutput = stats.gonkaRange?.output.low ?? null;
  const gonkaInput = stats.gonkaRange?.input.low ?? null;

  if (gonkaOutput != null && gonkaOutput > 0) {
    rows.push({
      id: "gonka",
      label: "Gonka",
      inputPerM: gonkaInput,
      outputPerM: gonkaOutput,
      isGonka: true,
    });
  }

  const marketRows: PriceSummaryRow[] = [];
  const openRouter = openRouterCheapest(stats);
  if (openRouter) marketRows.push(openRouter);

  for (const competitor of pickTopCompetitorsByPrice(stats.competitors, limit)) {
    marketRows.push({
      id: competitor.key,
      label: competitor.provider,
      inputPerM: competitor.inputPerM,
      outputPerM: competitor.outputPerM!,
      isGonka: false,
    });
  }

  marketRows.sort((a, b) => (a.outputPerM ?? 0) - (b.outputPerM ?? 0));
  return [...rows, ...marketRows];
}

export function buildPriceDetailRows(stats: ModelPricingStats): PriceSummaryRow[] {
  const rows: PriceSummaryRow[] = [];
  const gonkaOutput = stats.gonkaRange?.output.low ?? null;
  const gonkaInput = stats.gonkaRange?.input.low ?? null;

  if (gonkaOutput != null && gonkaOutput > 0) {
    rows.push({
      id: "gonka",
      label: "Gonka",
      inputPerM: gonkaInput,
      outputPerM: gonkaOutput,
      isGonka: true,
    });
  }

  const openRouter = openRouterCheapest(stats);
  if (openRouter) rows.push(openRouter);

  for (const row of [...stats.competitors]
    .filter((item) => item.inputPerM != null || item.outputPerM != null)
    .sort((a, b) => (a.outputPerM ?? 0) - (b.outputPerM ?? 0))) {
    rows.push({
      id: row.key,
      label: `${row.provider}${row.isVariant ? "*" : ""}`,
      inputPerM: row.inputPerM,
      outputPerM: row.outputPerM,
      isGonka: false,
    });
  }

  return rows;
}

export function formatUsd(value: number) {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatUsdRange(low: number, high: number) {
  if (Math.abs(high - low) < 0.0001) return formatUsd(low);
  return `${formatUsd(low)}–${formatUsd(high)}`;
}

export function formatMultiplier(value: number, formatNumber: (value: number) => string) {
  if (!Number.isFinite(value) || value <= 1.05) return null;
  if (value < 10) return `${value.toFixed(1)}×`;
  if (value < 1000) return `${formatNumber(Math.round(value))}×`;
  if (value < 10000) return `${(value / 1000).toFixed(1)}k×`;
  return `${formatNumber(Math.round(value / 1000))}k×`;
}
