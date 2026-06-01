import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { LIMITS_INTERVAL_MINUTES, PROBE_INTERVAL_MINUTES } from "./metrics";
import type { Broker, DashboardDetail, LimitsDetail, ProbeRun } from "./types";
import { LimitsPage } from "./components/LimitsPage";
import { MetricLogsPage } from "./components/MetricLogsPage";
import { OverviewPage } from "./components/OverviewPage";
import { ProvidersPage } from "./components/ProvidersPage";
import { RunHistory } from "./components/RunHistory";
import { TrendsPage } from "./components/TrendsPage";
import { useI18n, type Locale } from "./i18n";
import { useTheme } from "./useTheme";

type Tab = "overview" | "trends" | "providers" | "limits" | "history";

type AppView =
  | { kind: "tab"; tab: Tab }
  | { kind: "metric"; tab: Tab; metricKey: string; brokerId: number };

export default function App() {
  const [view, setView] = useState<AppView>({ kind: "tab", tab: "overview" });
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [limits, setLimits] = useState<LimitsDetail | null>(null);
  const [runs, setRuns] = useState<ProbeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const probing = runs.some((r) => r.status === "running" || r.status === "queued");
  const refreshMs = probing ? 8000 : 60_000;
  const tab = view.kind === "tab" ? view.tab : view.tab;

  const selectedMetric = useMemo(() => {
    if (view.kind !== "metric" || !detail) return null;
    const provider = detail.providers.find((p) => p.broker_id === view.brokerId);
    return provider?.metrics.find((m) => m.key === view.metricKey) ?? null;
  }, [view, detail]);

  const selectedBrokerName = useMemo(() => {
    if (view.kind !== "metric" || !detail) return null;
    return detail.providers.find((p) => p.broker_id === view.brokerId)?.broker_name ?? null;
  }, [view, detail]);

  const selectedBrokerBaseUrl = useMemo(() => {
    if (view.kind !== "metric" || !detail) return null;
    return detail.providers.find((p) => p.broker_id === view.brokerId)?.base_url ?? null;
  }, [view, detail]);

  const goToTab = (next: Tab) => setView({ kind: "tab", tab: next });
  const openMetric = (metricKey: string, brokerId: number) =>
    setView({ kind: "metric", tab: "overview", metricKey, brokerId });
  const closeMetric = () => setView({ kind: "tab", tab: "overview" });

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [b, d, r] = await Promise.all([
        api.listBrokers(),
        api.getDashboardDetail(),
        api.listRuns(),
      ]);
      setBrokers(b);
      setDetail(d);
      setRuns(r);
      api.getLimits().then(setLimits).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedLoad"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => refresh(true), refreshMs);
    return () => clearInterval(interval);
  }, [refresh, refreshMs]);

  return (
    <div className="site">
      <div className="grid-bg" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" aria-label="G meter">
            <div className="brand-mark" aria-hidden="true">G</div>
            <div>
              <div className="brand-name">meter</div>
              <div className="brand-tag">{t("app.tagline")}</div>
            </div>
          </div>

          <nav className="nav">
            {(
              [
                ["overview", t("tabs.overview")],
                ["trends", t("tabs.trends")],
                ["providers", t("tabs.providers")],
                ["limits", t("tabs.limits")],
                ["history", t("tabs.history")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`nav-link ${
                  (view.kind === "tab" && tab === id) ||
                  (view.kind === "metric" && view.tab === id)
                    ? "active"
                    : ""
                }`}
                onClick={() => goToTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "light" ? t("app.theme.dark") : t("app.theme.light")}
          >
            {theme === "light" ? "◐" : "◑"}
          </button>

          <div className="language-toggle" role="group" aria-label={t("app.language")}>
            {(["en", "ru"] as const).map((id: Locale) => (
              <button
                key={id}
                type="button"
                className={locale === id ? "active" : ""}
                onClick={() => setLocale(id)}
              >
                {id.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="status-chip">
            <span className={`status-dot ${probing ? "pulse" : "live"}`} />
            {probing ? t("app.measuring") : t("app.live")}
            {brokers.length > 0 && (
              <span className="provider-count">
                · {brokers.length}{" "}
                {brokers.length === 1 ? t("app.provider") : t("app.providers")}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        {view.kind === "metric" && selectedMetric && (
          <MetricLogsPage
            metric={selectedMetric}
            brokerId={view.brokerId}
            brokerName={selectedBrokerName}
            brokerBaseUrl={selectedBrokerBaseUrl}
            onBack={closeMetric}
          />
        )}
        {view.kind === "metric" && !selectedMetric && !loading && (
          <div className="empty-state compact">
            <h2>{t("errors.metricNotFound")}</h2>
            <button type="button" className="page-back" onClick={closeMetric}>
              ← {t("errors.backToOverview")}
            </button>
          </div>
        )}

        {view.kind === "tab" && tab === "overview" && (
          <OverviewPage
            detail={detail}
            loading={loading}
            probing={probing}
            onSelectMetric={(metric, brokerId) => openMetric(metric.key, brokerId)}
          />
        )}
        {view.kind === "tab" && tab === "trends" && (
          <TrendsPage runs={runs} brokers={brokers} loading={loading} />
        )}
        {view.kind === "tab" && tab === "providers" && (
          <ProvidersPage detail={detail} loading={loading} />
        )}
        {view.kind === "tab" && tab === "limits" && (
          <LimitsPage limits={limits} loading={loading} probing={probing} />
        )}
        {view.kind === "tab" && tab === "history" && (
          <RunHistory runs={runs} brokers={brokers} loading={loading} />
        )}
      </main>

      <footer className="footer">
        <span>
          {t("app.footer", {
            probe: PROBE_INTERVAL_MINUTES,
            limits: LIMITS_INTERVAL_MINUTES,
          })}
        </span>
        <span className="footer-links">
          <a href="https://github.com/gonkalabs/gmeter" target="_blank" rel="noreferrer">
            {t("app.githubRepo")}
          </a>
          <a href="https://gonkalabs.com" target="_blank" rel="noreferrer">
            {t("app.developers")}
          </a>
        </span>
      </footer>
    </div>
  );
}
