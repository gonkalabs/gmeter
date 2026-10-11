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
import { buildTrendPoints, modelLabel, type TrendChartPoint } from "../trendMetrics";
import { useI18n } from "../i18n";
import { BrokerLink, hostFromUrl } from "../brokerLinks";

const CHARTS = [
  { key: "latency_s", labelKey: "charts.latency", color: "#1863dc", percent: false },
  { key: "api_uptime_pct", labelKey: "charts.uptime", color: "#0c6b4d", percent: true },
  { key: "failed_probes_pct", labelKey: "charts.failed", color: "#9a4d12", percent: true },
  { key: "output_speed_tps", labelKey: "charts.output", color: "#003c33", percent: false },
] as const;

type ChartKey = (typeof CHARTS)[number]["key"];

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
    <div className="trend-metrics">
      {CHARTS.map((chart) => {
        const domain = yDomain(chart.key, chart.percent, rows);
        return (
          <section className="trend-metric" key={chart.key}>
            <header className="trend-metric-head">
              <h3>{t(chart.labelKey)}</h3>
              <span>
                {domain[0]}-{domain[1]}
              </span>
            </header>
            <div className="trend-metric-rows">
              {rows.map((row) => (
                <article className="trends-row" key={`${chart.key}-${row.brokerId}`}>
                  <div className="trends-row-inner">
                    <div className="trends-row-label">
                      <BrokerLink name={row.name} baseUrl={row.baseUrl}>
                        <strong>{row.name}</strong>
                      </BrokerLink>
                      <BrokerLink name={row.name} baseUrl={row.baseUrl} className="trends-row-host">
                        {row.host}
                      </BrokerLink>
                      {selectedModel ? (
                        <span className="trends-row-model">{modelLabel(selectedModel, brokers)}</span>
                      ) : null}
                      <span className="trends-row-meta">
                        {row.data.length}{" "}
                        {row.data.length === 1 ? t("common.check") : t("common.checks")}
                      </span>
                    </div>
                    {row.data.length === 0 ? (
                      <p className="trends-row-empty">
                        {selectedModel
                          ? t("trends.noQuickForModel", { model: modelLabel(selectedModel, brokers) })
                          : t("trends.noQuick")}
                      </p>
                    ) : (
                      <div className="trend-metric-chart">
                        <ResponsiveContainer width="100%" height={88}>
                          <LineChart data={row.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                            <XAxis
                              dataKey="time"
                              tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                              stroke="var(--border)"
                              interval="preserveStartEnd"
                              tickLine={false}
                            />
                            <YAxis
                              domain={domain}
                              tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                              stroke="var(--border)"
                              width={32}
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
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface ProviderRow {
  brokerId: number;
  name: string;
  baseUrl: string;
  host: string;
  data: TrendChartPoint[];
}

function buildProviderRows(
  runs: ProbeRun[],
  brokers: Broker[],
  selectedModel: string | null,
  locale: ReturnType<typeof useI18n>["locale"]
): ProviderRow[] {
  const brokerOrder = new Map(brokers.map((broker, index) => [broker.id, index]));
  return brokers
    .filter((broker) => broker.enabled)
    .sort((left, right) => (brokerOrder.get(left.id) ?? 0) - (brokerOrder.get(right.id) ?? 0))
    .map((broker) => ({
      brokerId: broker.id,
      name: broker.name,
      baseUrl: broker.base_url,
      host: hostFromUrl(broker.base_url),
      data: buildTrendPoints(runs, broker.id, selectedModel, locale),
    }));
}

function yDomain(key: ChartKey, percent: boolean, rows: ProviderRow[]): [number, number] {
  if (percent) return [0, 100];
  let max = 0;
  for (const row of rows) {
    for (const point of row.data) {
      const value = point[key];
      if (typeof value === "number" && value > max) max = value;
    }
  }
  if (max <= 0) return [0, 1];
  return [0, Math.ceil(max * 1.1)];
}
