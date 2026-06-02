export interface Broker {
  id: number;
  name: string;
  base_url: string;
  api_key_masked: string;
  models: string;
  model_aliases: Record<string, string>;
  enabled: boolean;
  created_at: string;
}

export interface DashboardMetrics {
  api_uptime_pct: number;
  latency_s: number;
  failed_probes_pct: number;
  output_speed_tps: number;
  stream_speed_tps: number;
  real_world_gen_pct: number;
  real_spend_per_m: number;
  total_runs: number;
  total_probes: number;
  broker_id: number | null;
  broker_name: string | null;
}

export interface MeasurementLog {
  id: number;
  run_id: number;
  measured_at: string;
  provider: string;
  model: string | null;
  test_name: string;
  ok: boolean;
  summary: string;
  response: string | null;
  error: string | null;
  latency_s: number | null;
  ttft_s: number | null;
  tps: number | null;
  stream_tps: number | null;
}

export interface MetricBlock {
  key: string;
  label: string;
  value: string;
  raw: Record<string, any>;
  logs: MeasurementLog[];
}

export interface ModelBlock {
  model: string;
  label: string;
  metrics: MetricBlock[];
}

export interface ProviderBlock {
  broker_id: number;
  broker_name: string;
  base_url: string;
  models_configured: string[];
  model_aliases: Record<string, string>;
  latest_run_id: number | null;
  latest_run_at: string | null;
  metrics: MetricBlock[];
  models: ModelBlock[];
}

export interface DashboardDetail {
  aggregate: DashboardMetrics;
  providers: ProviderBlock[];
}

export interface ProbeResult {
  id: number;
  model: string;
  test_name: string;
  ok: boolean;
  latency_s: number | null;
  ttft_s: number | null;
  tps: number | null;
  stream_tps: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  detail: Record<string, unknown> | null;
  error: string | null;
  gonka_limitation: boolean;
}

export interface ProbeRun {
  id: number;
  broker_id: number;
  run_type?: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
  results: ProbeResult[];
}

export interface LimitLadderStep {
  label: string;
  ok: boolean;
  ttft: number | null;
  error: string | null;
}

export interface ModelLimits {
  model: string;
  label: string;
  max_input_ok: boolean;
  max_input_k: number;
  max_input_ladder: LimitLadderStep[];
  max_input_error: string | null;
  max_output_ok: boolean;
  max_output_tokens: number;
  max_output_required: number;
  max_output_error: string | null;
  gonka_limitation: boolean;
}

export interface ProviderLimits {
  broker_id: number;
  broker_name: string;
  base_url: string;
  run_id: number | null;
  measured_at: string | null;
  models: ModelLimits[];
}

export interface LimitsDetail {
  min_output_required: number;
  limits_interval_minutes: number;
  providers: ProviderLimits[];
}

export type ExpandedMetric = {
  providerId: number;
  modelKey: string | null;
  metricKey: string;
};
