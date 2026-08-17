import { useState } from "react";
import type { DashboardDetail } from "../types";
import { useI18n } from "../i18n";

interface Props {
  detail: DashboardDetail;
  compact?: boolean;
}

export function NetworkEpochBanner({ detail, compact = false }: Props) {
  const { t, formatDate } = useI18n();
  const [epochOpen, setEpochOpen] = useState(false);
  const notice = detail.network_notice?.trim();
  const inactive = detail.network_models?.filter((item) => !item.active) ?? [];
  const aiSummary = detail.ai_network_summary?.trim();
  const hasEpoch = Boolean(notice || inactive.length);

  if (!aiSummary && !hasEpoch) return null;

  return (
    <section className={`network-epoch-banner ${compact ? "is-compact" : ""}`} role="status">
      <div className="network-status-stack">
        {aiSummary ? (
          <div className="network-ai-summary">
            <div className="network-ai-summary-head">
              <span className="network-epoch-badge network-ai-badge">{t("network.aiBadge")}</span>
              <div>
                <strong>{t("network.aiTitle")}</strong>
                <p>{aiSummary}</p>
                {detail.ai_summary_at ? (
                  <span className="network-ai-meta">
                    {t("network.aiMeta", {
                      model: detail.ai_summary_model?.split("/").pop() || "DeepSeek",
                      time: formatDate(detail.ai_summary_at, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {hasEpoch ? (
          <div className={`network-epoch-collapsible ${epochOpen ? "is-open" : ""}`}>
            <button
              type="button"
              className="network-epoch-toggle"
              aria-expanded={epochOpen}
              onClick={() => setEpochOpen((open) => !open)}
            >
              <span className="network-epoch-badge">{t("network.epochBadge")}</span>
              <span className="network-epoch-toggle-title">{t("network.epochTitle")}</span>
              <span className="network-epoch-toggle-hint">
                {epochOpen ? t("network.hideEpoch") : t("network.showEpoch")}
              </span>
            </button>
            {epochOpen ? (
              <div className="network-epoch-panel">
                <p>{notice || t("network.epochFallback")}</p>
                {inactive.length > 0 && (
                  <ul className="network-epoch-models">
                    {inactive.map((item) => (
                      <li key={item.model_id}>
                        <span className="network-epoch-model-name">{item.label}</span>
                        {item.status_note ? (
                          <span className="network-epoch-model-note">{item.status_note}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {detail.network_update_url ? (
                  <a
                    className="network-epoch-link"
                    href={detail.network_update_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("network.readUpdate")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
