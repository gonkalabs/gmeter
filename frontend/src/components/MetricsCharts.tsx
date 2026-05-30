import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Broker, ProbeRun } from "../types";
import { buildTrendPoints, modelLabel } from "../trendMetrics";
import { useI18n } from "../i18n";
import { BrokerLink, hostFromUrl } from "../brokerLinks";

const CHARTS = [
  { key: "latency_s", labelKey: "charts.latency", color: "#0070f3" },
  { key: "api_uptime_pct", labelKey: "charts.uptime", color: "#12a594" },
  { key: "failed_probes_pct", labelKey: "charts.failed", color: "#f5a623" },
  { key: "output_speed_tps", labelKey: "charts.output", color: "#7928ca" },
] as const;

interface Props {
  runs: ProbeRun[];
  brokers: Broker[];
  selectedModel: string | null;
}

export function MetricsCharts({ runs, brokers, selectedModel }: Props) {
  const { locale, t } = useI18n();
  const rows = useMemo(
    () => buildProviderRows(runs, brokers, selectedModel, locale),
    [runs, brokers, selectedModel, locale]
  );

  if (rows.length === 0) return null;

  return (
    <div className="trends-rows">
      {rows.map((row) => (
        <article className="trends-row" key={row.brokerId}>
          <div className="trends-row-inner">
            <div className="trends-row-label">
              <BrokerLink name={row.name} baseUrl={row.baseUrl}>
                <strong>{row.name}</strong>
              </BrokerLink>
              <BrokerLink name={row.name} baseUrl={row.baseUrl} className="trends-row-host">
                {row.host}
              </BrokerLink>
              {selectedModel && (
                <span className="trends-row-model">{modelLabel(selectedModel, brokers)}</span>
              )}
              <span className="trends-row-meta">
                {row.data.length} {row.data.length === 1 ? t("common.check") : t("common.checks")}
              </span>
            </div>

            {row.data.length === 0 ? (
              <p className="trends-row-empty">
                {selectedModel
                  ? t("trends.noQuickForModel", { model: modelLabel(selectedModel, brokers) })
                  : t("trends.noQuick")}
              </p>
            ) : (
              <div className="trends-row-charts">
                {CHARTS.map((chart) => (
                  <div className="trends-mini-chart" key={chart.key}>
                    <div className="trends-mini-title">{t(chart.labelKey)}</div>
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={row.data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                          stroke="var(--border)"
                          interval="preserveStartEnd"
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                          stroke="var(--border)"
                          width={28}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 11,
                          }}
                          labelStyle={{ color: "var(--text-secondary)" }}
                        />
                        <Line
                          type="monotone"
                          dataKey={chart.key}
                          name={t(chart.labelKey)}
                          stroke={chart.color}
                          strokeWidth={2}
                          dot={{ r: 2, fill: chart.color }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

interface ProviderRow {
  brokerId: number;
  name: string;
  baseUrl: string;
  host: string;
  data: ReturnType<typeof buildTrendPoints>;
}

function buildProviderRows(
  runs: ProbeRun[],
  brokers: Broker[],
  selectedModel: string | null,
  locale: ReturnType<typeof useI18n>["locale"]
): ProviderRow[] {
  const brokerOrder = new Map(brokers.map((b, i) => [b.id, i]));
  return brokers
    .filter((b) => b.enabled)
    .sort((a, b) => (brokerOrder.get(a.id) ?? 0) - (brokerOrder.get(b.id) ?? 0))
    .map((broker) => ({
      brokerId: broker.id,
      name: broker.name,
      baseUrl: broker.base_url,
      host: hostFromUrl(broker.base_url),
      data: buildTrendPoints(runs, broker.id, selectedModel, locale),
    }));
}
