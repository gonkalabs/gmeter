import { useState } from "react";
import type { LimitsDetail, ModelLimits } from "../types";
import { LIMITS_INTERVAL_MINUTES } from "../metrics";
import { useI18n } from "../i18n";
import { hostFromUrl } from "../brokerLinks";

interface Props {
  limits: LimitsDetail | null;
  loading: boolean;
  probing?: boolean;
}

export function LimitsPage({ limits, loading, probing }: Props) {
  const { t, formatDate, formatNumber } = useI18n();
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);

  const active =
    limits?.providers.find((p) => p.broker_id === selectedProvider) ??
    limits?.providers[0] ??
    null;

  if (loading && !limits) {
    return <div className="skeleton-panel" />;
  }

  if (!limits || limits.providers.length === 0) {
    return (
      <div className="empty-state compact">
        <h2>{t("limits.emptyTitle")}</h2>
        <p>{t("limits.emptyHint", { interval: LIMITS_INTERVAL_MINUTES })}</p>
      </div>
    );
  }

  const hasData = limits.providers.some((p) => p.run_id);

  return (
    <div className="dashboard-layout">
      <section className="page-section">
        <header className="section-header">
          <h2>{t("limits.title")}</h2>
          <p>
            {t("limits.hint", {
              interval: limits.limits_interval_minutes,
              tokens: formatNumber(limits.min_output_required),
            })}
          </p>
        </header>

        {!hasData && (
          <div className="banner banner-info">
            <span className={`status-dot ${probing ? "pulse" : ""}`} />
            {probing ? t("limits.firstRunning") : t("limits.waiting")}
          </div>
        )}

        <div className="limits-layout">
          <div className="limits-providers">
            <div className="col-title">{t("limits.providers")}</div>
            <ul className="entity-list">
              {limits.providers.map((provider) => (
                <li key={provider.broker_id}>
                  <div
                    className={`entity-item ${
                      (selectedProvider ?? limits.providers[0]?.broker_id) === provider.broker_id
                        ? "active"
                        : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedProvider(provider.broker_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        setSelectedProvider(provider.broker_id);
                      }
                    }}
                  >
                    <span className="entity-name">
                      {provider.broker_name}
                    </span>
                    <span className="entity-host">
                      {hostFromUrl(provider.base_url)}
                    </span>
                    {provider.measured_at ? (
                      <span className="entity-meta">
                        {formatDate(provider.measured_at, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span className="entity-meta">{t("common.notMeasured")}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="limits-detail">
            {!active?.run_id ? (
              <p className="col-hint">{t("limits.noData")}</p>
            ) : (
              active.models.map((model) => <ModelLimitsCard key={model.model} model={model} />)
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ModelLimitsCard({ model }: { model: ModelLimits }) {
  const { t, formatNumber } = useI18n();
  const [showLadder, setShowLadder] = useState(false);

  return (
    <article className="limits-card">
      <header className="limits-card-head">
        <div>
          <strong>{model.label}</strong>
          <code>{model.model}</code>
        </div>
        {model.gonka_limitation && <span className="limits-tag">{t("common.platformLimit")}</span>}
      </header>

      <div className="limits-metrics">
        <div className={`limits-metric ${model.max_input_ok ? "pass" : "fail"}`}>
          <span className="limits-metric-label">{t("limits.maxContext")}</span>
          <span className="limits-metric-value">
            {(model.max_input_ladder.length > 0 || model.max_input_error) && model.max_input_k > 0
              ? t("limits.kTokens", { count: model.max_input_k })
              : "—"}
          </span>
          <span className={`status-pill ${model.max_input_ok ? "completed" : "failed"}`}>
            {model.max_input_ok ? t("common.pass") : t("common.fail")}
          </span>
          {model.max_input_error && !model.max_input_ok && (
            <p className="limits-error">{model.max_input_error}</p>
          )}
          {model.max_input_ladder.length > 0 && (
            <>
              <button
                type="button"
                className="limits-toggle"
                onClick={() => setShowLadder((v) => !v)}
              >
                {t("limits.inputLadder", {
                  action: showLadder ? t("common.hide") : t("common.show"),
                  count: model.max_input_ladder.length,
                })}
              </button>
              {showLadder && (
                <ul className="limits-ladder">
                  {model.max_input_ladder.map((step) => (
                    <li key={step.label} className={step.ok ? "pass" : "fail"}>
                      <span>{step.label}</span>
                      <span>{step.ok ? t("common.ok") : step.error || t("common.fail")}</span>
                      {step.ttft != null && <span>{step.ttft}s TTFT</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className={`limits-metric ${model.max_output_ok ? "pass" : "fail"}`}>
          <span className="limits-metric-label">{t("limits.maxOutput")}</span>
          <span className="limits-metric-value">
            {model.max_output_tokens > 0
              ? t("limits.tokens", { count: formatNumber(model.max_output_tokens) })
              : "—"}
          </span>
          <span className="limits-metric-sub">
            {t("limits.required", { count: formatNumber(model.max_output_required) })}
          </span>
          <span className={`status-pill ${model.max_output_ok ? "completed" : "failed"}`}>
            {model.max_output_ok ? t("common.pass") : t("common.fail")}
          </span>
          {model.max_output_error && !model.max_output_ok && (
            <p className="limits-error">{model.max_output_error}</p>
          )}
        </div>
      </div>
    </article>
  );
}
