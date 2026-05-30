import { useState } from "react";
import type { MetricBlock } from "../types";
import { metricMeta, streamNote, toneForMetric } from "../metrics";
import { ProbeLogTable } from "./ProbeLogTable";
import { useI18n } from "../i18n";

interface StripProps {
  metrics: MetricBlock[];
  expandedKey: string | null;
  onToggle: (key: string) => void;
  prefix: string;
  dense?: boolean;
}

export function MetricStrip({ metrics, expandedKey, onToggle, prefix, dense }: StripProps) {
  const { t } = useI18n();
  const active = metrics.find((m) => expandedKey === `${prefix}:${m.key}`);

  return (
    <div className={`metric-strip-wrap ${dense ? "dense" : ""}`}>
      <div className="metric-strip" role="row">
        {metrics.map((metric) => {
          const meta = metricMeta(metric.key, t);
          const open = expandedKey === `${prefix}:${metric.key}`;
          const note = streamNote(metric, t);
          return (
            <button
              key={metric.key}
              className={`metric-cell tone-${toneForMetric(metric)} ${open ? "open" : ""}`}
              onClick={() => onToggle(`${prefix}:${metric.key}`)}
              aria-expanded={open}
              title={meta?.help}
            >
              <span className="cell-label">{meta?.label ?? metric.label}</span>
              <span className="cell-value">{metric.value}</span>
              {note && <span className="cell-sub">{note}</span>}
            </button>
          );
        })}
      </div>
      {active && <MetricLogs metric={active} />}
    </div>
  );
}

export function MetricLogs({ metric }: { metric: MetricBlock }) {
  const { t } = useI18n();
  const emptyMessage =
    metric.key === "failed_probes"
      ? t("logs.allPassed")
      : t("logs.noMetric");
  const meta = metricMeta(metric.key, t);

  return (
    <div className="metric-logs">
      <div className="logs-header">
        <span>{meta?.label ?? metric.label}</span>
        <span className="logs-count">
          {metric.key === "failed_probes"
            ? t("logs.countFailed", { count: metric.logs.length })
            : t("logs.countLogs", { count: metric.logs.length })}
        </span>
      </div>
      <ProbeLogTable logs={metric.logs} emptyMessage={emptyMessage} />
    </div>
  );
}

export function MetricGroups({
  metrics,
  expandedKey,
  onToggle,
  prefix,
}: StripProps) {
  const { t } = useI18n();
  const groups = [
    { id: "reliability", label: t("metricGroups.reliability"), keys: ["api_uptime", "failed_probes"] },
    { id: "performance", label: t("metricGroups.performance"), keys: ["latency", "output_speed"] },
    { id: "capabilities", label: t("metricGroups.capabilities"), keys: ["real_world_gen"] },
    { id: "cost", label: t("metricGroups.cost"), keys: ["real_spend"] },
  ];

  return (
    <div className="metric-groups">
      {groups.map((group) => {
        const items = metrics.filter((m) => group.keys.includes(m.key));
        if (!items.length) return null;
        return (
          <div className="metric-group" key={group.id}>
            <div className="metric-group-label">{group.label}</div>
            <MetricStrip
              metrics={items}
              expandedKey={expandedKey}
              onToggle={onToggle}
              prefix={prefix}
              dense
            />
          </div>
        );
      })}
    </div>
  );
}
