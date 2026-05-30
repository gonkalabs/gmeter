import type { MetricBlock } from "../types";
import {
  buildAggregateMetrics,
  displayMetricValue,
  GLANCE_COLUMNS,
  metricMeta,
  metricGaugePercent,
  toneForMetric,
} from "../metrics";
import { Speedometer } from "./Speedometer";
import type { DashboardDetail } from "../types";
import { useI18n } from "../i18n";

interface Props {
  detail: DashboardDetail;
  onSelect: (metric: MetricBlock, brokerId: number) => void;
}

export function GaugeDashboard({ detail, onSelect }: Props) {
  const { t } = useI18n();
  const metrics = buildAggregateMetrics(detail);
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const bestProvider = (key: string) => {
    let best: { metric: MetricBlock; brokerId: number } | null = null;
    for (const provider of detail.providers) {
      if (!provider.latest_run_id) continue;
      const metric = provider.metrics.find((m) => m.key === key);
      if (!metric) continue;
      const pct = metricGaugePercent(metric);
      if (pct == null) continue;
      if (!best || pct > (metricGaugePercent(best.metric) ?? 0)) {
        best = { metric, brokerId: provider.broker_id };
      }
    }
    return best;
  };

  return (
    <section className="gauge-dashboard">
      {GLANCE_COLUMNS.map((key) => {
        const metric = byKey.get(key);
        if (!metric) return null;
        const pct = metricGaugePercent(metric);
        const empty = pct == null;
        const drill = bestProvider(key);
        const meta = metricMeta(key, t);

        return (
          <Speedometer
            key={key}
            value={pct ?? 0}
            label={meta?.label ?? key}
            displayValue={displayMetricValue(metric)}
            tone={empty ? "neutral" : toneForMetric(metric)}
            size="md"
            empty={empty}
            title={meta?.help}
            onClick={
              drill
                ? () => onSelect(drill.metric, drill.brokerId)
                : undefined
            }
          />
        );
      })}
    </section>
  );
}
