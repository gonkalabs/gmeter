import type { Broker, DashboardDetail, LimitsDetail, MeasurementLog, PricingComparison, ProbeRun } from "./types";

const BASE = "/api";

function parseError(status: number, text: string): string {
  if (text.includes("<html") || text.includes("<!DOCTYPE")) {
    if (status === 504) return "The service is taking longer than expected. Data refreshes automatically.";
    if (status === 502) return "Service temporarily unavailable. Please try again shortly.";
    return "Something went wrong. Please try again shortly.";
  }
  try {
    const json = JSON.parse(text);
    if (json.detail) return typeof json.detail === "string" ? json.detail : "Request failed.";
  } catch {
    /* plain text */
  }
  return text.slice(0, 200) || "Request failed.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseError(res.status, text));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listBrokers: () => request<Broker[]>("/brokers"),
  createBroker: (broker: {
    name: string;
    base_url: string;
    api_key: string;
    models: string;
    model_aliases?: Record<string, string>;
  }) =>
    request<Broker>("/brokers", {
      method: "POST",
      body: JSON.stringify(broker),
    }),
  deleteBroker: (brokerId: number) =>
    request<void>(`/brokers/${brokerId}`, { method: "DELETE" }),
  getDashboardDetail: () => request<DashboardDetail>("/metrics/dashboard/detail"),
  getMetricLogs: (brokerId: number, metricKey: string, model?: string) =>
    request<MeasurementLog[]>(
      `/metrics/dashboard/logs?broker_id=${brokerId}&metric_key=${encodeURIComponent(metricKey)}${
        model ? `&model=${encodeURIComponent(model)}` : ""
      }`
    ),
  getLimits: () => request<LimitsDetail>("/metrics/limits"),
  getPricingComparison: () => request<PricingComparison>("/metrics/pricing/comparison"),
  listRuns: (brokerId?: number) =>
    request<ProbeRun[]>(
      `/runs${brokerId ? `?broker_id=${brokerId}&limit=50` : "?limit=50"}`
    ),
};
