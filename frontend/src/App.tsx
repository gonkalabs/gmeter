import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Broker, DashboardDetail, LimitsDetail, ProbeRun } from "./types";
import { BrokerIndexProvider } from "./brokerLinks";
import { BrokerPage } from "./components/BrokerPage";
import { ComparePricesPage } from "./components/ComparePricesPage";
import { LimitsPage } from "./components/LimitsPage";
import { MetricLogsPage } from "./components/MetricLogsPage";
import { OverviewPage } from "./components/OverviewPage";
import { ProvidersPage } from "./components/ProvidersPage";
import { RunHistory } from "./components/RunHistory";
import { SiteShell } from "./components/SiteShell";
import { TrendsPage } from "./components/TrendsPage";
import { useI18n } from "./i18n";
import {
  metricPath,
  navigate,
  parseRoute,
  providerPath,
  useLocationPath,
  type RouteName,
} from "./routes";

export default function App() {
  const href = useLocationPath();
  const pathname = href.split("?")[0] || "/";
  const search = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  const route = useMemo(() => parseRoute(pathname), [pathname]);
  const metricQuery = useMemo(() => new URLSearchParams(search).get("metric"), [search]);

  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [limits, setLimits] = useState<LimitsDetail | null>(null);
  const [runs, setRuns] = useState<ProbeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { t } = useI18n();

  const probing = runs.some((r) => r.status === "running" || r.status === "queued");
  const refreshMs = probing ? 8000 : 60_000;

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path === "/compare/start") navigate("/compare", true);
  }, [href]);

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
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => refresh(true), refreshMs);
    return () => clearInterval(interval);
  }, [refresh, refreshMs]);

  const selectedMetric = useMemo(() => {
    if (route.name !== "metric" || !detail) return null;
    const provider = detail.providers.find((p) => p.broker_id === route.brokerId);
    return provider?.metrics.find((m) => m.key === route.metricKey) ?? null;
  }, [route, detail]);

  const selectedBroker = useMemo(() => {
    if (route.name !== "metric" || !detail) return null;
    return detail.providers.find((p) => p.broker_id === route.brokerId) ?? null;
  }, [route, detail]);

  const brokerName =
    route.name === "broker"
      ? detail?.providers.find((item) => item.broker_id === route.brokerId)?.broker_name
      : undefined;
  const page = pageCopy(route.name, t, brokerName);

  useEffect(() => {
    document.title = `${page.title} · meter.gonka.gg`;
  }, [page.title]);

  const jumps =
    route.name === "overview"
      ? [
          { href: "/#gauges", label: t("overview.jumpGauges") },
          { href: "/#glance", label: t("overview.jumpGlance") },
          { href: "/#prices", label: t("overview.jumpPrices") },
        ]
      : undefined;

  return (
    <BrokerIndexProvider brokers={brokers.map((broker) => ({ id: broker.id, name: broker.name }))}>
    <SiteShell
      active={route.name}
      title={page.title}
      lead={page.lead}
      jumps={jumps}
      probing={probing}
      brokerCount={brokers.length}
    >
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {route.name === "overview" && (
        <OverviewPage
          detail={detail}
          loading={loading}
          probing={probing}
          onSelectMetric={(metric, brokerId) => {
            const provider = detail?.providers.find((p) => p.broker_id === brokerId);
            navigate(metricPath(provider?.broker_name ?? "broker", brokerId, metric.key));
          }}
        />
      )}

      {route.name === "trends" && (
        <TrendsPage runs={runs} brokers={brokers} loading={loading} model={route.model} />
      )}

      {route.name === "providers" && (
        <ProvidersPage
          detail={detail}
          loading={loading}
          brokerId={route.brokerId}
          model={route.model}
          logs={route.logs}
          metricKey={metricQuery}
        />
      )}

      {route.name === "limits" && (
        <LimitsPage
          limits={limits}
          loading={loading}
          probing={probing}
          brokerId={route.brokerId}
          model={route.model}
        />
      )}

      {route.name === "history" && (
        <RunHistory
          runs={runs}
          brokers={brokers}
          loading={loading}
          runId={route.runId}
          resultId={route.resultId}
        />
      )}

      {route.name === "compare" && (
        <ComparePricesPage detail={detail} loading={loading} error={error} />
      )}

      {route.name === "broker" && (
        <BrokerPage brokerId={route.brokerId} detail={detail} limits={limits} loading={loading} />
      )}

      {route.name === "metric" && selectedMetric && (
        <MetricLogsPage
          metric={selectedMetric}
          brokerId={route.brokerId}
          brokerName={selectedBroker?.broker_name}
          brokerBaseUrl={selectedBroker?.base_url}
          backHref={
            selectedBroker
              ? providerPath(selectedBroker.broker_name, selectedBroker.broker_id)
              : "/"
          }
        />
      )}

      {route.name === "metric" && !selectedMetric && !loading && (
        <div className="empty-state compact">
          <h2>{t("errors.metricNotFound")}</h2>
          <a className="page-back" href="/">
            ← {t("errors.backToOverview")}
          </a>
        </div>
      )}

      {route.name === "notfound" && (
        <div className="empty-state compact">
          <p>{t("notFound.hint")}</p>
          <a className="page-back" href="/">
            {t("notFound.home")}
          </a>
        </div>
      )}
    </SiteShell>
    </BrokerIndexProvider>
  );
}

function pageCopy(name: RouteName, t: ReturnType<typeof useI18n>["t"], brokerName?: string) {
  if (name === "trends") return { title: t("tabs.trends") };
  if (name === "providers") return { title: t("tabs.providers") };
  if (name === "limits") return { title: t("tabs.limits") };
  if (name === "history") return { title: t("tabs.history") };
  if (name === "compare") return { title: t("tabs.compare"), lead: t("pricing.hint") };
  if (name === "metric") return { title: t("tabs.overview") };
  if (name === "broker") return { title: brokerName || t("tabs.providers") };
  if (name === "notfound") return { title: t("notFound.title") };
  return { title: t("tabs.overview"), lead: t("app.tagline") };
}
