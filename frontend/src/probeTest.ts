import type { ProbeResult } from "./types";
import type { TFunction } from "./i18n";

export const TEST_LABELS: Record<string, string> = {
  connectivity: "Connectivity",
  output_ladder: "Output ladder",
  input_ladder: "Input ladder",
  max_input: "Max context",
  max_output: "Max output",
  tool_calling: "Tool calling",
  json_mode: "JSON mode",
  multimodality: "Vision",
};

export function testLabel(name: string, t?: TFunction) {
  if (t) {
    const keys = {
      connectivity: "tests.connectivity",
      output_ladder: "tests.output_ladder",
      input_ladder: "tests.input_ladder",
      max_input: "tests.max_input",
      max_output: "tests.max_output",
      tool_calling: "tests.tool_calling",
      json_mode: "tests.json_mode",
      multimodality: "tests.multimodality",
    } as const;
    const key = keys[name as keyof typeof keys];
    if (key) return t(key);
  }
  return TEST_LABELS[name] ?? name;
}

export function formatProbeJson(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

export function probeRequestText(result: ProbeResult): string | null {
  const req = result.detail?.request;
  if (!req) return null;
  return formatProbeJson(req);
}

export function probeResponseText(result: ProbeResult): string | null {
  const detail = result.detail ?? {};
  if (typeof detail.response === "string" && detail.response) {
    return formatProbeJson(detail.response);
  }
  return null;
}

export interface MeasurementItem {
  label: string;
  value: string;
}

export function probeMeasurements(result: ProbeResult, t?: TFunction): MeasurementItem[] {
  const items: MeasurementItem[] = [];
  if (result.latency_s != null) {
    items.push({ label: t ? t("measurements.latency") : "Latency", value: `${result.latency_s}s` });
  }
  if (result.ttft_s != null) items.push({ label: t ? t("measurements.ttft") : "TTFT", value: `${result.ttft_s}s` });
  if (result.tps != null) items.push({ label: t ? t("measurements.outputSpeed") : "Output speed", value: `${result.tps} tps` });
  if (result.stream_tps != null) {
    items.push({ label: t ? t("measurements.streamSpeed") : "Stream speed", value: `${result.stream_tps} tps` });
  }
  if (result.tokens_in != null) items.push({ label: t ? t("measurements.tokensIn") : "Tokens in", value: String(result.tokens_in) });
  if (result.tokens_out != null) items.push({ label: t ? t("measurements.tokensOut") : "Tokens out", value: String(result.tokens_out) });

  const detail = result.detail ?? {};
  const skip = new Set(["request", "response", "results", "models"]);
  for (const [key, value] of Object.entries(detail)) {
    if (skip.has(key) || value == null) continue;
    if (typeof value === "object") continue;
    items.push({ label: key.replace(/_/g, " "), value: String(value) });
  }

  return items;
}

export interface LadderStep {
  label: string;
  ok: boolean;
  ttft?: number | null;
  error?: string | null;
  response?: string | null;
  request?: unknown;
}

export function probeLadderSteps(result: ProbeResult): LadderStep[] {
  const steps = result.detail?.results;
  if (!Array.isArray(steps)) return [];
  return steps as LadderStep[];
}
