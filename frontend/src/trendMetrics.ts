import type { Broker, ProbeRun } from "./types";
import type { Locale } from "./i18n";

export const MODEL_LABELS: Record<string, string> = {
  kimi: "kimi",
  qwen: "qwen",
  minimax: "minimax",
};

const MODEL_ORDER = ["kimi", "qwen", "minimax"];

export interface TrendChartPoint {
  time: string;
  sort: number;
  latency_s: number;
  api_uptime_pct: number;
  failed_probes_pct: number;
  output_speed_tps: number | null;
}

export function modelKey(modelId: string): string {
  const normalized = modelId.trim().toLowerCase();
  if (normalized.includes("kimi")) return "kimi";
  if (normalized.includes("qwen")) return "qwen";
  if (normalized.includes("minimax")) return "minimax";
  return normalized.split("/").pop() ?? normalized;
}

export function modelLabel(modelId: string, brokers: Broker[] = []): string {
  const key = modelKey(modelId);
  for (const broker of brokers) {
    for (const [configuredModel, alias] of Object.entries(broker.model_aliases ?? {})) {
      if (modelKey(configuredModel) === key) return alias;
    }
  }
  return MODEL_LABELS[key] ?? key;
}

export function collectTrendModels(brokers: Broker[], runs: ProbeRun[]): string[] {
  const ids = new Set<string>();
  for (const broker of brokers) {
    for (const model of broker.models.split(",").map((m) => m.trim()).filter(Boolean)) {
      ids.add(modelKey(model));
    }
  }
  for (const run of runs) {
    if (run.run_type && run.run_type !== "quick") continue;
    for (const result of run.results) {
      if (result.model !== "broker") ids.add(modelKey(result.model));
    }
  }
  return [...ids].sort((a, b) => {
    const aIndex = MODEL_ORDER.indexOf(a);
    const bIndex = MODEL_ORDER.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? MODEL_ORDER.length : aIndex) - (bIndex === -1 ? MODEL_ORDER.length : bIndex);
    }
    return modelLabel(a, brokers).localeCompare(modelLabel(b, brokers));
  });
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function localeTag(locale: Locale) {
  return locale === "ru" ? "ru-RU" : "en-US";
}

function chartTime(finishedAt: string, locale: Locale): { time: string; sort: number } {
  const finished = new Date(finishedAt);
  return {
    time: finished.toLocaleString(localeTag(locale), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    sort: finished.getTime(),
  };
}

function computeAggregatePoint(
  summary: Record<string, number>,
  finishedAt: string,
  locale: Locale
): TrendChartPoint {
  const { time, sort } = chartTime(finishedAt, locale);
  return {
    time,
    sort,
    latency_s: summary.latency_s ?? 0,
    api_uptime_pct: summary.api_uptime_pct ?? 0,
    failed_probes_pct: summary.failed_probes_pct ?? 0,
    output_speed_tps: summary.output_speed_tps || summary.stream_speed_tps || 0,
  };
}

function computeModelPoint(run: ProbeRun, selectedModel: string, locale: Locale): TrendChartPoint | null {
  const selectedKey = modelKey(selectedModel);
  const modelResults = run.results.filter(
    (r) => r.model !== "broker" && modelKey(r.model) === selectedKey
  );
  if (!modelResults.length || !run.finished_at) return null;

  const connectivity = run.results.find(
    (r) => r.model === "broker" && r.test_name === "connectivity"
  );
  const latencies = modelResults
    .map((r) => r.latency_s)
    .filter((v): v is number => v != null);
  const streamSpeeds = modelResults
    .map((r) => r.stream_tps)
    .filter((v): v is number => v != null && v > 0);
  const tpsValues = modelResults.map((r) => r.tps).filter((v): v is number => v != null && v > 0);
  const outputSpeeds = tpsValues.length ? tpsValues : streamSpeeds;
  const failed = modelResults.filter((r) => !r.ok).length;
  const { time, sort } = chartTime(run.finished_at, locale);

  return {
    time,
    sort,
    latency_s: round(avg(latencies)),
    api_uptime_pct: connectivity?.ok ? 100 : 0,
    failed_probes_pct: round((100 * failed) / modelResults.length, 1),
    output_speed_tps: outputSpeeds.length ? round(avg(outputSpeeds)) : null,
  };
}

export function buildTrendPoints(
  runs: ProbeRun[],
  brokerId: number,
  selectedModel: string | null,
  locale: Locale = "en"
): TrendChartPoint[] {
  const completed = runs
    .filter(
      (run) =>
        run.broker_id === brokerId &&
        run.status === "completed" &&
        run.summary &&
        run.finished_at &&
        (!run.run_type || run.run_type === "quick")
    )
    .sort((a, b) => new Date(a.finished_at!).getTime() - new Date(b.finished_at!).getTime());

  const points: TrendChartPoint[] = [];
  for (const run of completed) {
    if (selectedModel) {
      const point = computeModelPoint(run, selectedModel, locale);
      if (point) points.push(point);
    } else {
      points.push(computeAggregatePoint(run.summary as Record<string, number>, run.finished_at!, locale));
    }
  }
  return points;
}
