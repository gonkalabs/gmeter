import type { DashboardDetail } from "../types";
import { healthFromMetrics, healthLabel, metricGaugePercent, PROBE_INTERVAL_MINUTES } from "../metrics";
import { Speedometer } from "./Speedometer";
import { useI18n } from "../i18n";

interface Props {
  detail: DashboardDetail;
  probing: boolean;
}

export function StatusBanner({ detail, probing }: Props) {
  const { t } = useI18n();
  const agg = detail.aggregate;
  const providerMetrics = detail.providers
    .filter((p) => p.latest_run_id)
    .map((p) => p.metrics);
  const tones = providerMetrics.map(healthFromMetrics);
  const bad = tones.filter((t) => t === "bad").length;
  const warn = tones.filter((t) => t === "warn").length;
  const good = tones.filter((t) => t === "good").length;

  let headline = t("status.allHealthy");
  let tone: "good" | "warn" | "bad" | "neutral" = "good";

  if (probing) {
    headline = t("status.measuring");
    tone = "neutral";
  } else if (bad > 0) {
    headline = t("status.unreachable", {
      count: bad,
      provider: bad === 1 ? t("app.provider") : t("app.providers"),
    });
    tone = "bad";
  } else if (warn > 0) {
    headline = t("status.degraded", {
      count: warn,
      provider: warn === 1 ? t("app.provider") : t("app.providers"),
    });
    tone = "warn";
  } else if (good === 0) {
    headline = t("status.waiting");
    tone = "neutral";
  }

  const healthScore = providerMetrics.length
    ? Math.round(
        providerMetrics.reduce((sum, metrics) => {
          const parts = metrics
            .map((m) => metricGaugePercent(m))
            .filter((v): v is number => v != null);
          return sum + (parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0);
        }, 0) / providerMetrics.length
      )
    : 0;

  return (
    <section className={`status-banner tone-${tone}`}>
      <div className="status-banner-main">
        <Speedometer
          value={healthScore}
          label={t("health.health")}
          displayValue={`${healthScore}%`}
          tone={tone === "neutral" ? "neutral" : tone}
          size="md"
          empty={providerMetrics.length === 0}
          title={t("health.overallTitle")}
        />
        <div>
          <strong>{headline}</strong>
          <p>
            {t("status.summary", {
              providers: detail.providers.length,
              interval: PROBE_INTERVAL_MINUTES,
              runs: agg.total_runs,
            })}
          </p>
        </div>
      </div>
      <div className="status-banner-stats">
        <StatPill label={t("status.healthy")} value={good} tone="good" />
        <StatPill label={t("status.degradedPill")} value={warn} tone="warn" />
        <StatPill label={t("status.down")} value={bad} tone="bad" />
      </div>
    </section>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
}) {
  return (
    <div className={`stat-pill tone-${tone}`}>
      <span className="stat-pill-value">{value}</span>
      <span className="stat-pill-label">{label}</span>
    </div>
  );
}

export function providerHealthLabel(metrics: import("../types").MetricBlock[]) {
  return healthLabel(healthFromMetrics(metrics));
}
