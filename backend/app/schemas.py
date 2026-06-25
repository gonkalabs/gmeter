from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class BrokerCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    models: str = ""
    model_aliases: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True


class BrokerUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    models: str | None = None
    model_aliases: dict[str, str] | None = None
    enabled: bool | None = None


class BrokerOut(BaseModel):
    id: int
    name: str
    base_url: str
    api_key_masked: str
    models: str
    model_aliases: dict[str, str] = Field(default_factory=dict)
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProbeResultOut(BaseModel):
    id: int
    model: str
    test_name: str
    ok: bool
    latency_s: float | None
    ttft_s: float | None
    tps: float | None
    stream_tps: float | None
    tokens_in: int | None
    tokens_out: int | None
    detail: dict[str, Any] | None
    error: str | None
    gonka_limitation: bool


class ProbeRunOut(BaseModel):
    id: int
    broker_id: int
    run_type: str = "quick"
    status: str
    started_at: datetime
    finished_at: datetime | None
    error: str | None
    summary: dict[str, Any] | None
    results: list[ProbeResultOut] = Field(default_factory=list)


class DashboardMetrics(BaseModel):
    api_uptime_pct: float
    latency_s: float
    failed_probes_pct: float
    output_speed_tps: float
    stream_speed_tps: float
    real_world_gen_pct: float
    real_spend_per_m: float
    total_runs: int
    total_probes: int
    broker_id: int | None = None
    broker_name: str | None = None


class MeasurementLog(BaseModel):
    id: int
    run_id: int
    measured_at: datetime
    provider: str
    model: str | None = None
    test_name: str
    ok: bool
    summary: str
    response: str | None = None
    error: str | None = None
    latency_s: float | None = None
    ttft_s: float | None = None
    tps: float | None = None
    stream_tps: float | None = None


class MetricBlock(BaseModel):
    key: str
    label: str
    value: str
    raw: dict[str, Any]
    logs: list[MeasurementLog] = Field(default_factory=list)


class ModelBlock(BaseModel):
    model: str
    label: str
    metrics: list[MetricBlock]


class ProviderBlock(BaseModel):
    broker_id: int
    broker_name: str
    base_url: str
    models_configured: list[str] = Field(default_factory=list)
    model_aliases: dict[str, str] = Field(default_factory=dict)
    latest_run_id: int | None = None
    latest_run_at: datetime | None = None
    metrics: list[MetricBlock]
    models: list[ModelBlock] = Field(default_factory=list)


class DashboardDetail(BaseModel):
    aggregate: DashboardMetrics
    providers: list[ProviderBlock] = Field(default_factory=list)


class RunRequest(BaseModel):
    models: list[str] | None = None
    mode: str = "quick"
    quick: bool = False


class LimitLadderStep(BaseModel):
    label: str
    ok: bool
    ttft: float | None = None
    error: str | None = None


class ModelLimits(BaseModel):
    model: str
    label: str
    max_input_ok: bool
    max_input_k: int
    max_input_ladder: list[LimitLadderStep] = Field(default_factory=list)
    max_input_error: str | None = None
    max_output_ok: bool
    max_output_tokens: int
    max_output_required: int
    max_output_error: str | None = None
    gonka_limitation: bool = False


class ProviderLimits(BaseModel):
    broker_id: int
    broker_name: str
    base_url: str
    run_id: int | None = None
    measured_at: datetime | None = None
    models: list[ModelLimits] = Field(default_factory=list)


class LimitsDetail(BaseModel):
    min_output_required: int
    limits_interval_minutes: int
    providers: list[ProviderLimits] = Field(default_factory=list)


class CompetitorPriceRow(BaseModel):
    provider: str
    model_id: str
    match_type: str = "exact"
    input_per_m: float | None = None
    output_per_m: float | None = None
    source: str
    source_label: str = "OpenRouter"


class ModelPriceComparison(BaseModel):
    model_id: str
    label: str
    openrouter_slug: str | None = None
    variant_ids_searched: list[str] = Field(default_factory=list)
    variants_found: list[str] = Field(default_factory=list)
    competitors: list[CompetitorPriceRow] = Field(default_factory=list)
    no_exact_listing: bool = False


class PricingComparison(BaseModel):
    checked_at: datetime
    source: str
    models: list[ModelPriceComparison] = Field(default_factory=list)
