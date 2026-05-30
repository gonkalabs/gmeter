import type { DashboardDetail, MetricBlock } from "./types";
import type { TFunction } from "./i18n";

export type Tone = "good" | "warn" | "neutral" | "bad";

export const PROBE_INTERVAL_MINUTES = 10;
export const LIMITS_INTERVAL_MINUTES = 60;

export const METRIC_GROUPS = [
  { id: "reliability", label: "Reliability", desc: "Can we reach the API?" },
  { id: "performance", label: "Performance", desc: "How fast is inference?" },
  { id: "capabilities", label: "Capabilities", desc: "Tools, JSON, vision, context" },
  { id: "cost", label: "Cost", desc: "Estimated spend per 1M tokens" },
] as const;

export const METRIC_META: Record<
  string,
  { label: string; help: string; group: (typeof METRIC_GROUPS)[number]["id"] }
> = {
  api_uptime: {
    label: "API uptime",
    help: "Gateway responds to /models",
    group: "reliability",
  },
  failed_probes: {
    label: "Failed tests",
    help: "Share of probe steps that failed",
    group: "reliability",
  },
  latency: {
    label: "Latency",
    help: "Average response time",
    group: "performance",
  },
  output_speed: {
    label: "Output speed",
    help: "Tokens generated per second",
    group: "performance",
  },
  real_world_gen: {
    label: "Capabilities",
    help: "Tools, JSON mode, max I/O pass rate",
    group: "capabilities",
  },
  real_spend: {
    label: "Cost / 1M tokens",
    help: "USD / 1M tokens from broker /api/pricing when available",
    group: "cost",
  },
};

export function toneForMetric(metric: MetricBlock): Tone {
  const { key, raw } = metric;
  if (key === "api_uptime") {
    if (raw.api_uptime_pct >= 99) return "good";
    if (raw.api_uptime_pct >= 95) return "neutral";
    return "warn";
  }
  if (key === "latency") {
    if (raw.latency_s <= 2) return "good";
    if (raw.latency_s <= 10) return "neutral";
    return "warn";
  }
  if (key === "failed_probes") return raw.failed_probes_pct <= 5 ? "good" : "warn";
  if (key === "real_world_gen") return raw.real_world_gen_pct >= 70 ? "good" : "neutral";
  return "neutral";
}

export function healthFromMetrics(metrics: MetricBlock[]): Tone {
  if (!metrics.length) return "neutral";
  const uptime = metrics.find((m) => m.key === "api_uptime");
  const failed = metrics.find((m) => m.key === "failed_probes");
  if (uptime && uptime.raw.api_uptime_pct === 0) return "bad";
  if (
    metrics.some((m) => toneForMetric(m) === "warn") ||
    (failed && failed.raw.failed_probes_pct > 5)
  ) {
    return "warn";
  }
  return "good";
}

export function healthLabel(tone: Tone, t?: TFunction): string {
  if (tone === "good") return t ? t("health.healthy") : "Healthy";
  if (tone === "warn") return t ? t("health.degraded") : "Degraded";
  if (tone === "bad") return t ? t("health.down") : "Down";
  return t ? t("health.unknown") : "Unknown";
}

export function streamNote(metric: MetricBlock, t?: TFunction): string | undefined {
  if (metric.key !== "output_speed") return undefined;
  const value = metric.raw.stream_speed_tps ?? 0;
  return t ? t("metrics.stream", { value }) : `Stream: ${value} tps`;
}

export function metricMeta(key: string, t?: TFunction) {
  const meta = METRIC_META[key];
  if (!meta || !t) return meta;
  const labels = {
    api_uptime: "metrics.api_uptime.label",
    failed_probes: "metrics.failed_probes.label",
    latency: "metrics.latency.label",
    output_speed: "metrics.output_speed.label",
    real_world_gen: "metrics.real_world_gen.label",
    real_spend: "metrics.real_spend.label",
  } as const;
  const helps = {
    api_uptime: "metrics.api_uptime.help",
    failed_probes: "metrics.failed_probes.help",
    latency: "metrics.latency.help",
    output_speed: "metrics.output_speed.help",
    real_world_gen: "metrics.real_world_gen.help",
    real_spend: "metrics.real_spend.help",
  } as const;
  const typedKey = key as keyof typeof labels;
  return {
    ...meta,
    label: labels[typedKey] ? t(labels[typedKey]) : meta.label,
    help: helps[typedKey] ? t(helps[typedKey]) : meta.help,
  };
}

export function groupMetrics(metrics: MetricBlock[]) {
  return METRIC_GROUPS.map((group) => ({
    ...group,
    metrics: metrics.filter((m) => METRIC_META[m.key]?.group === group.id),
  })).filter((g) => g.metrics.length > 0);
}

export function sortProvidersByScore<T extends { latest_run_id: number | null; metrics: MetricBlock[] }>(
  providers: T[]
): T[] {
  return [...providers].sort((a, b) => {
    const aReady = a.latest_run_id != null;
    const bReady = b.latest_run_id != null;
    if (aReady !== bReady) return aReady ? -1 : 1;
    return providerScore(b.metrics) - providerScore(a.metrics);
  });
}

export function providerScore(metrics: MetricBlock[]): number {
  const uptime = metrics.find((m) => m.key === "api_uptime")?.raw.api_uptime_pct ?? 0;
  const failed = metrics.find((m) => m.key === "failed_probes")?.raw.failed_probes_pct ?? 100;
  const latency = metrics.find((m) => m.key === "latency")?.raw.latency_s ?? 999;
  const caps = metrics.find((m) => m.key === "real_world_gen")?.raw.real_world_gen_pct ?? 0;
  const output = metrics.find((m) => m.key === "output_speed");
  const outputTps = output?.raw.output_speed_tps || output?.raw.stream_speed_tps || 0;

  if (uptime === 0) return -1000;
  return uptime * 10 - failed * 8 - latency * 3 + caps * 0.2 + outputTps * 0.05;
}

/** Map a metric to 0-100 for gauge display. Higher means a larger measured value. */
export function metricGaugePercent(metric: MetricBlock): number | null {
  const { key, raw } = metric;

  if (key === "api_uptime") return raw.api_uptime_pct ?? 0;

  if (key === "failed_probes") {
    const failed = raw.failed_probes_pct ?? 100;
    return Math.max(0, Math.min(100, failed));
  }

  if (key === "latency") {
    const s = raw.latency_s ?? 999;
    if (s <= 1) return 100;
    if (s <= 2) return 90;
    if (s <= 5) return 70;
    if (s <= 10) return 45;
    if (s <= 20) return 20;
    return 5;
  }

  if (key === "output_speed") {
    const tps = raw.output_speed_tps || raw.stream_speed_tps || 0;
    if (tps <= 0) return 0;
    if (tps >= 80) return 100;
    return Math.min(100, (tps / 80) * 100);
  }

  if (key === "real_world_gen") return raw.real_world_gen_pct ?? 0;

  if (key === "real_spend") {
    if (!raw.pricing_available || raw.real_spend_per_m == null || raw.real_spend_per_m <= 0) {
      return null;
    }
    const rate = raw.real_spend_per_m;
    return Math.max(0, Math.min(100, (rate / 0.01) * 100));
  }

  return 50;
}

export function displayMetricValueCompact(metric: MetricBlock): string {
  if (metric.key === "real_spend") {
    if (!metric.raw.pricing_available || metric.raw.real_spend_per_m == null) {
      return "—";
    }
    const low = metric.raw.real_spend_per_m;
    const high = metric.raw.real_spend_max ?? low;
    if (high !== low) {
      return `$${low.toFixed(4)}+`;
    }
    return `$${low.toFixed(4)}`;
  }
  if (metric.key === "output_speed") {
    const tps = metric.raw.output_speed_tps || metric.raw.stream_speed_tps || 0;
    return tps ? `${Math.round(tps)} tps` : "0 tps";
  }
  if (metric.key === "latency") {
    return `${metric.raw.latency_s}s`;
  }
  if (metric.key === "api_uptime") {
    return `${Math.round(metric.raw.api_uptime_pct)}%`;
  }
  if (metric.key === "failed_probes") {
    return `${metric.raw.failed_probes_pct}%`;
  }
  if (metric.key === "real_world_gen") {
    return `${Math.round(metric.raw.real_world_gen_pct)}%`;
  }
  return displayMetricValue(metric);
}

export function displayMetricValue(metric: MetricBlock): string {
  if (metric.key === "output_speed") {
    if (
      metric.raw.output_speed_tps === 0 &&
      metric.raw.stream_speed_tps
    ) {
      return `${metric.raw.stream_speed_tps} tps`;
    }
  }
  if (metric.key === "real_spend") {
    if (!metric.raw.pricing_available || metric.raw.real_spend_per_m == null) {
      return "—";
    }
    const low = metric.raw.real_spend_per_m;
    const high = metric.raw.real_spend_max ?? low;
    if (high !== low) {
      return `$${low.toFixed(6)}–$${high.toFixed(6)}`;
    }
    return `$${low.toFixed(6)}`;
  }
  return metric.value;
}

export const GLANCE_COLUMNS = [
  "api_uptime",
  "failed_probes",
  "latency",
  "output_speed",
  "real_world_gen",
  "real_spend",
] as const;

export const GLANCE_LABELS: Record<(typeof GLANCE_COLUMNS)[number], string> = {
  api_uptime: "Uptime",
  failed_probes: "Failed",
  latency: "Latency",
  output_speed: "Output",
  real_world_gen: "Caps",
  real_spend: "Cost",
};

export function glanceLabel(key: (typeof GLANCE_COLUMNS)[number], t?: TFunction): string {
  if (!t) return GLANCE_LABELS[key];
  const labels = {
    api_uptime: "glance.uptime",
    failed_probes: "glance.failed",
    latency: "glance.latency",
    output_speed: "glance.output",
    real_world_gen: "glance.caps",
    real_spend: "glance.cost",
  } as const;
  return t(labels[key]);
}

export function buildAggregateMetrics(detail: DashboardDetail): MetricBlock[] {
  const byKey = new Map<string, MetricBlock>();
  for (const provider of detail.providers) {
    for (const metric of provider.metrics) {
      if (!byKey.has(metric.key)) byKey.set(metric.key, { ...metric, logs: [] });
      byKey.get(metric.key)!.logs.push(...metric.logs);
    }
  }
  const agg = detail.aggregate;
  const values: Record<string, string> = {
    api_uptime: `${agg.api_uptime_pct}%`,
    latency: `${agg.latency_s}s`,
    failed_probes: `${agg.failed_probes_pct}%`,
    output_speed: `${agg.output_speed_tps} tps`,
    real_world_gen: `${agg.real_world_gen_pct}%`,
    real_spend: agg.real_spend_per_m > 0 ? `$${agg.real_spend_per_m.toFixed(6)}` : "—",
  };
  return [...byKey.values()].map((m) => ({
    ...m,
    value: values[m.key] ?? m.value,
    raw: {
      ...m.raw,
      api_uptime_pct: agg.api_uptime_pct,
      latency_s: agg.latency_s,
      failed_probes_pct: agg.failed_probes_pct,
      output_speed_tps: agg.output_speed_tps,
      stream_speed_tps: agg.stream_speed_tps,
      real_world_gen_pct: agg.real_world_gen_pct,
      real_spend_per_m: agg.real_spend_per_m,
      pricing_available: agg.real_spend_per_m > 0 ? 1 : 0,
    },
  }));
}

export function sortProbeLogs<T extends { provider: string; model: string | null; test_name: string; ok: boolean }>(
  logs: T[]
): T[] {
  return [...logs].sort((a, b) => {
    const byProvider = a.provider.localeCompare(b.provider);
    if (byProvider) return byProvider;
    const byModel = (a.model ?? "").localeCompare(b.model ?? "");
    if (byModel) return byModel;
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    return a.test_name.localeCompare(b.test_name);
  });
}
