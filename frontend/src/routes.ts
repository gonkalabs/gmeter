import { useEffect, useState } from "react";

export type RouteName =
  | "overview"
  | "trends"
  | "providers"
  | "limits"
  | "history"
  | "compare"
  | "metric"
  | "broker"
  | "notfound";

export type AppRoute =
  | { name: "overview" }
  | { name: "trends"; model: string | null }
  | { name: "providers"; brokerId: number | null; model: string | null; logs: boolean }
  | { name: "limits"; brokerId: number | null; model: string | null }
  | { name: "history"; runId: number | null; resultId: number | null }
  | { name: "metric"; brokerId: number; metricKey: string }
  | { name: "compare" }
  | { name: "broker"; brokerId: number }
  | { name: "notfound" };

export function brokerSlug(name: string, id: number) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "broker"}-b${id}`;
}

export function brokerIdFromSlug(slug: string): number | null {
  const match = slug.match(/-b(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function decodePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRoute(pathname: string): AppRoute {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean).map(decodePart);
  if (parts.length === 0) return { name: "overview" };

  const [a, b, c, d, e] = parts;

  if (a === "trends") {
    if (parts.length === 1) return { name: "trends", model: null };
    if (b === "models" && c && parts.length === 3) return { name: "trends", model: c };
    return { name: "notfound" };
  }

  if (a === "providers") {
    if (parts.length === 1) return { name: "providers", brokerId: null, model: null, logs: false };
    const brokerId = b ? brokerIdFromSlug(b) : null;
    if (brokerId == null) return { name: "notfound" };
    if (parts.length === 2) return { name: "providers", brokerId, model: null, logs: false };
    if (c === "models" && d && parts.length === 4) {
      return { name: "providers", brokerId, model: d, logs: false };
    }
    if (c === "models" && d && e === "logs" && parts.length === 5) {
      return { name: "providers", brokerId, model: d, logs: true };
    }
    return { name: "notfound" };
  }

  if (a === "limits") {
    if (parts.length === 1) return { name: "limits", brokerId: null, model: null };
    const brokerId = b ? brokerIdFromSlug(b) : null;
    if (brokerId == null) return { name: "notfound" };
    if (parts.length === 2) return { name: "limits", brokerId, model: null };
    if (c && parts.length === 3) return { name: "limits", brokerId, model: c };
    return { name: "notfound" };
  }

  if (a === "history") {
    if (parts.length === 1) return { name: "history", runId: null, resultId: null };
    const runId = Number(b);
    if (!Number.isFinite(runId)) return { name: "notfound" };
    if (parts.length === 2) return { name: "history", runId, resultId: null };
    if (c === "results" && d && parts.length === 4) {
      const resultId = Number(d);
      if (!Number.isFinite(resultId)) return { name: "notfound" };
      return { name: "history", runId, resultId };
    }
    return { name: "notfound" };
  }

  if (a === "metrics" && b && c && parts.length === 3) {
    const brokerId = brokerIdFromSlug(b);
    if (brokerId == null) return { name: "notfound" };
    return { name: "metric", brokerId, metricKey: c };
  }

  if (a === "compare" && (parts.length === 1 || (b === "start" && parts.length === 2))) {
    return { name: "compare" };
  }

  if (a === "brokers" && b && parts.length === 2) {
    const brokerId = brokerIdFromSlug(b);
    if (brokerId == null) return { name: "notfound" };
    return { name: "broker", brokerId };
  }

  return { name: "notfound" };
}

export function brokerPagePath(name: string, id: number) {
  return `/brokers/${brokerSlug(name, id)}`;
}

export function trendPath(model?: string | null) {
  return model ? `/trends/models/${encodeURIComponent(model)}` : "/trends";
}

export function providerPath(name: string, id: number) {
  return `/providers/${brokerSlug(name, id)}`;
}

export function providerModelPath(name: string, id: number, model: string, logs = false, metric?: string | null) {
  const base = `${providerPath(name, id)}/models/${encodeURIComponent(model)}`;
  const path = logs ? `${base}/logs` : base;
  return metric ? `${path}?metric=${encodeURIComponent(metric)}` : path;
}

export function limitsPath(name?: string, id?: number | null, model?: string | null) {
  if (!name || id == null) return "/limits";
  const base = `/limits/${brokerSlug(name, id)}`;
  return model ? `${base}/${encodeURIComponent(model)}` : base;
}

export function historyPath(runId?: number | null, resultId?: number | null) {
  if (runId == null) return "/history";
  if (resultId == null) return `/history/${runId}`;
  return `/history/${runId}/results/${resultId}`;
}

export function metricPath(name: string, id: number, metricKey: string) {
  return `/metrics/${brokerSlug(name, id)}/${encodeURIComponent(metricKey)}`;
}

export function navigate(to: string, replace = false) {
  const url = new URL(to, window.location.origin);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) {
    if (url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView();
    }
    return;
  }
  if (replace) window.history.replaceState(null, "", next);
  else window.history.pushState(null, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (url.hash) {
    requestAnimationFrame(() => {
      document.getElementById(url.hash.slice(1))?.scrollIntoView();
    });
  } else {
    window.scrollTo(0, 0);
  }
}

export function useLocationPath() {
  const [href, setHref] = useState(
    () => `${window.location.pathname}${window.location.search}`
  );

  useEffect(() => {
    const sync = () => setHref(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return href;
}
