from datetime import datetime
from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload

from app.models import Broker, ProbeResult, ProbeRun
from app.schemas import (
    DashboardDetail,
    DashboardMetrics,
    MeasurementLog,
    MetricBlock,
    ModelBlock,
    ProviderBlock,
)
from app.services.dashboard import (
    METRIC_KEYS,
    METRIC_LABELS,
    _result_row,
    compute_metric_values,
    format_response,
    format_log_line,
    format_metric_value,
    metric_matches,
    model_label,
)
from app.services.metrics import get_dashboard_metrics
from app.services.model_catalog import broker_model_aliases, broker_model_ids
from app.services.pricing import spend_values_for_scope


def _build_logs(
    rows: list[Any],
    metric_key: str,
    *,
    run_id: int,
    measured_at: datetime,
    provider_name: str,
    model: str | None = None,
    aliases: dict[str, str] | None = None,
    include_detail: bool = True,
) -> list[MeasurementLog]:
    logs: list[MeasurementLog] = []
    for r in rows:
        row = _result_row(r, include_detail=include_detail)
        if not metric_matches(metric_key, row):
            continue
        if model is not None and row["model"] != model:
            continue
        if model is None and row["model"] != "broker" and metric_key == "api_uptime":
            continue
        if metric_key != "api_uptime" and row["model"] == "broker":
            continue

        logs.append(
            MeasurementLog(
                id=r.id,
                run_id=run_id,
                measured_at=measured_at,
                provider=provider_name,
                model=model_label(row["model"], aliases) if row["model"] != "broker" else None,
                test_name=row["test_name"],
                ok=row["ok"],
                summary=format_log_line(row),
                response=format_response(row) if include_detail else None,
                error=row.get("error"),
                latency_s=row.get("latency_s"),
                ttft_s=row.get("ttft_s"),
                tps=row.get("tps"),
                stream_tps=row.get("stream_tps"),
            )
        )
    return logs


def _metric_blocks(
    rows: list[Any],
    *,
    run_id: int,
    measured_at: datetime,
    provider_name: str,
    model: str | None = None,
    configured_models: list[str] | None = None,
    prices: dict[str, float] | None = None,
    aliases: dict[str, str] | None = None,
    spend_values: dict[str, Any] | None = None,
    include_logs: bool = True,
    include_detail: bool = True,
) -> list[MetricBlock]:
    dict_rows = [_result_row(r, include_detail=include_detail) for r in rows]
    if model is not None:
        dict_rows = [r for r in dict_rows if r["model"] == model]
    elif any(r["model"] == "broker" for r in dict_rows):
        pass
    else:
        dict_rows = [r for r in dict_rows if r["model"] != "broker"]

    spend = spend_values or spend_values_for_scope(
        rows=dict_rows,
        model=model,
        configured_models=configured_models or [],
        prices=prices or {},
    )
    values = compute_metric_values(dict_rows, spend_values=spend)
    blocks: list[MetricBlock] = []
    for key in METRIC_KEYS:
        if key == "stream_speed":
            continue
        if model is not None and key == "api_uptime":
            continue
        logs = []
        if include_logs:
            logs = _build_logs(
                rows,
                key,
                run_id=run_id,
                measured_at=measured_at,
                provider_name=provider_name,
                model=model,
                aliases=aliases,
                include_detail=include_detail,
            )
            if key == "output_speed":
                logs.extend(
                    _build_logs(
                        rows,
                        "stream_speed",
                        run_id=run_id,
                        measured_at=measured_at,
                        provider_name=provider_name,
                        model=model,
                        aliases=aliases,
                        include_detail=include_detail,
                    )
                )
        blocks.append(
            MetricBlock(
                key=key,
                label=METRIC_LABELS[key],
                value=format_metric_value(key, values),
                raw=values,
                logs=logs,
            )
        )
    return blocks


def get_dashboard_detail(db: Session, broker_id: int | None = None) -> DashboardDetail:
    aggregate = get_dashboard_metrics(db, broker_id)

    broker_q = db.query(Broker).filter(Broker.enabled.is_(True)).order_by(Broker.name)
    if broker_id:
        broker_q = broker_q.filter(Broker.id == broker_id)
    brokers = broker_q.all()

    providers: list[ProviderBlock] = []
    for broker in brokers:
        aliases = broker_model_aliases(broker)
        configured = broker_model_ids(broker)
        run = (
            db.query(ProbeRun)
            .options(
                selectinload(ProbeRun.results).load_only(
                    ProbeResult.id,
                    ProbeResult.run_id,
                    ProbeResult.model,
                    ProbeResult.test_name,
                    ProbeResult.ok,
                    ProbeResult.latency_s,
                    ProbeResult.ttft_s,
                    ProbeResult.tps,
                    ProbeResult.stream_tps,
                    ProbeResult.tokens_in,
                    ProbeResult.tokens_out,
                    ProbeResult.error,
                    ProbeResult.gonka_limitation,
                )
            )
            .filter(
                ProbeRun.broker_id == broker.id,
                ProbeRun.status == "completed",
                ProbeRun.run_type == "quick",
            )
            .order_by(desc(ProbeRun.finished_at))
            .first()
        )
        if not run:
            providers.append(
                ProviderBlock(
                    broker_id=broker.id,
                    broker_name=broker.name,
                    base_url=broker.base_url,
                    models_configured=configured,
                    model_aliases=aliases,
                    latest_run_id=None,
                    latest_run_at=None,
                    metrics=_empty_metric_blocks(),
                    models=[],
                )
            )
            continue

        measured_at = run.finished_at or run.started_at
        model_ids = sorted({r.model for r in run.results if r.model != "broker"})
        spend = (
            {
                "pricing_available": True,
                "real_spend_per_m": run.summary.get("real_spend_per_m"),
                "real_spend_max": run.summary.get("real_spend_per_m"),
            }
            if run.summary and run.summary.get("real_spend_per_m")
            else {"pricing_available": False}
        )
        providers.append(
            ProviderBlock(
                broker_id=broker.id,
                broker_name=broker.name,
                base_url=broker.base_url,
                models_configured=configured,
                model_aliases=aliases,
                latest_run_id=run.id,
                latest_run_at=measured_at,
                metrics=_metric_blocks(
                    run.results,
                    run_id=run.id,
                    measured_at=measured_at,
                    provider_name=broker.name,
                    configured_models=configured,
                    prices={},
                    aliases=aliases,
                    spend_values=spend,
                    include_logs=True,
                    include_detail=False,
                ),
                models=[
                    ModelBlock(
                        model=model_id,
                        label=model_label(model_id, aliases),
                        metrics=_metric_blocks(
                            run.results,
                            run_id=run.id,
                            measured_at=measured_at,
                            provider_name=broker.name,
                            model=model_id,
                            configured_models=configured,
                            prices={},
                            aliases=aliases,
                            include_logs=True,
                            include_detail=False,
                        ),
                    )
                    for model_id in model_ids
                ],
            )
        )

    return DashboardDetail(aggregate=aggregate, providers=providers)


def get_metric_logs(
    db: Session,
    *,
    broker_id: int,
    metric_key: str,
    model: str | None = None,
) -> list[MeasurementLog]:
    broker = db.get(Broker, broker_id)
    if not broker or not broker.enabled:
        return []

    run = (
        db.query(ProbeRun)
        .options(selectinload(ProbeRun.results))
        .filter(
            ProbeRun.broker_id == broker.id,
            ProbeRun.status == "completed",
            ProbeRun.run_type == "quick",
        )
        .order_by(desc(ProbeRun.finished_at))
        .first()
    )
    if not run:
        return []

    aliases = broker_model_aliases(broker)
    logs = _build_logs(
        run.results,
        metric_key,
        run_id=run.id,
        measured_at=run.finished_at or run.started_at,
        provider_name=broker.name,
        model=model,
        aliases=aliases,
        include_detail=True,
    )
    if metric_key == "output_speed":
        logs.extend(
            _build_logs(
                run.results,
                "stream_speed",
                run_id=run.id,
                measured_at=run.finished_at or run.started_at,
                provider_name=broker.name,
                model=model,
                aliases=aliases,
                include_detail=True,
            )
        )
    return logs


def _empty_metric_blocks() -> list[MetricBlock]:
    values = compute_metric_values([])
    return [
        MetricBlock(
            key=key,
            label=METRIC_LABELS[key],
            value=format_metric_value(key, values),
            raw=values,
            logs=[],
        )
        for key in METRIC_KEYS
        if key != "stream_speed"
    ]
