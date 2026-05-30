import { useMemo } from "react";
import type { DashboardDetail, MetricBlock } from "../types";
import { sortProvidersByScore } from "../metrics";
import { GaugeDashboard } from "./GaugeDashboard";
import { StatusBanner } from "./StatusBanner";
import { SummaryGrid } from "./SummaryGrid";
import { useI18n } from "../i18n";

interface Props {
  detail: DashboardDetail | null;
  loading: boolean;
  probing?: boolean;
  onSelectMetric: (metric: MetricBlock, brokerId: number) => void;
}

export function OverviewPage({ detail, loading, probing, onSelectMetric }: Props) {
  const { t } = useI18n();
  const providers = useMemo(
    () => (detail ? sortProvidersByScore(detail.providers) : []),
    [detail]
  );

  if (loading && !detail) {
    return <div className="skeleton-panel" />;
  }

  if (!detail || detail.aggregate.total_runs === 0) {
    return (
      <div className="empty-state compact-empty">
        <span className={`status-dot ${probing ? "pulse" : ""}`} />
        <div>
          <strong>{probing ? t("overview.firstMeasurement") : t("overview.collecting")}</strong>
          <p>{t("overview.collectingHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <StatusBanner detail={detail} probing={!!probing} />

      <section className="page-section gauge-section">
        <header className="section-header">
          <div>
            <h2>{t("overview.liveGauges")}</h2>
            <p>{t("overview.liveGaugesHint")}</p>
          </div>
        </header>
        <GaugeDashboard detail={detail} onSelect={onSelectMetric} />
      </section>

      <section className="page-section glance-section">
        <header className="section-header glance-header">
          <div>
            <h2>{t("overview.atGlance")}</h2>
            <p>{t("overview.atGlanceHint")}</p>
          </div>
          <span className="glance-header-hint">{t("overview.clickLogs")}</span>
        </header>
        <SummaryGrid providers={providers} onSelect={onSelectMetric} />
      </section>
    </div>
  );
}
