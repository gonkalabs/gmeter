from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import Broker, ProbeResult, ProbeRun
from app.probes.constants import REAL_WORLD_TESTS
from app.schemas import DashboardMetrics
from app.services.model_catalog import broker_model_ids
from app.services.pricing import (
    average_price_for_models,
    derived_prices_from_rows,
)


def compute_run_summary(
    results: list[tuple[str, dict[str, Any]]],
    price_per_million: float | None = None,
) -> dict[str, Any]:
    probes = [item for _, item in results if item.get("test_name") != "pricing_probe"]
    total = len(probes)
    failed = sum(1 for p in probes if not p.get("ok"))
    connectivity = next(
        (p for _, p in results if p.get("test_name") == "connectivity"), None
    )

    latencies = [p["latency_s"] for p in probes if p.get("latency_s") is not None]
    stream_speeds = [
        p["stream_tps"] for p in probes if p.get("stream_tps") is not None
    ]
    output_speeds = [p["tps"] for p in probes if p.get("tps") is not None]
    if not output_speeds:
        output_speeds = stream_speeds

    real_world = [
        p for p in probes if p.get("test_name") in REAL_WORLD_TESTS
    ]
    rw_ok = sum(1 for p in real_world if p.get("ok"))

    total_tokens = 0
    for p in probes:
        total_tokens += p.get("tokens_in") or 0
        total_tokens += p.get("tokens_out") or 0

    summary = {
        "api_uptime_pct": round(
            (100.0 if connectivity and connectivity.get("ok") else 0.0), 1
        ),
        "latency_s": round(sum(latencies) / len(latencies), 2) if latencies else 0,
        "failed_probes_pct": round(100 * failed / total, 1) if total else 0,
        "output_speed_tps": round(
            sum(output_speeds) / len(output_speeds), 2
        )
        if output_speeds
        else 0,
        "stream_speed_tps": round(
            sum(stream_speeds) / len(stream_speeds), 2
        )
        if stream_speeds
        else 0,
        "real_world_gen_pct": round(100 * rw_ok / len(real_world), 1)
        if real_world
        else 0,
        "total_tokens": total_tokens,
        "total_probes": total,
        "failed_probes": failed,
    }
    if price_per_million is not None:
        summary["real_spend_per_m"] = price_per_million
    return summary


def summarize_results(results: list[ProbeResult]) -> dict[str, Any]:
    pairs = [(r.model, _result_dict(r)) for r in results]
    return compute_run_summary(pairs)


def _result_dict(r: ProbeResult) -> dict[str, Any]:
    return {
        "test_name": r.test_name,
        "ok": r.ok,
        "latency_s": r.latency_s,
        "ttft_s": r.ttft_s,
        "tps": r.tps,
        "stream_tps": r.stream_tps,
        "tokens_in": r.tokens_in,
        "tokens_out": r.tokens_out,
        "detail": r.detail,
        "error": r.error,
        "gonka_limitation": r.gonka_limitation,
    }


def _aggregate_spend(db: Session, broker_id: int | None) -> float:
    brokers = []
    if broker_id:
        broker = db.get(Broker, broker_id)
        if broker:
            brokers = [broker]
    else:
        brokers = db.query(Broker).filter(Broker.enabled.is_(True)).all()

    rates: list[float] = []
    for broker in brokers:
        configured = broker_model_ids(broker)
        run = (
            db.query(ProbeRun)
            .filter(
                ProbeRun.broker_id == broker.id,
                ProbeRun.status == "completed",
                ProbeRun.run_type == "quick",
            )
            .order_by(desc(ProbeRun.finished_at))
            .first()
        )
        avg = None
        if run:
            if run.summary:
                avg = run.summary.get("real_spend_per_m")
            if avg is None:
                full_run = (
                    db.query(ProbeRun)
                    .options(joinedload(ProbeRun.results))
                    .filter(ProbeRun.id == run.id)
                    .first()
                )
                if full_run:
                    rows = [{**_result_dict(r), "model": r.model} for r in full_run.results]
                    derived_prices = derived_prices_from_rows(rows)
                    avg, _ = average_price_for_models(derived_prices, configured)
        if avg is not None:
            rates.append(avg)
    return sum(rates) / len(rates) if rates else 0.0


def get_dashboard_metrics(
    db: Session, broker_id: int | None = None
) -> DashboardMetrics:
    q = db.query(ProbeRun).filter(
        ProbeRun.status == "completed",
        ProbeRun.run_type == "quick",
    )
    if broker_id:
        q = q.filter(ProbeRun.broker_id == broker_id)
    runs = q.order_by(desc(ProbeRun.finished_at)).limit(20).all()

    if not runs:
        broker = db.get(Broker, broker_id) if broker_id else None
        return DashboardMetrics(
            api_uptime_pct=0,
            latency_s=0,
            failed_probes_pct=0,
            output_speed_tps=0,
            stream_speed_tps=0,
            real_world_gen_pct=0,
            real_spend_per_m=0,
            total_runs=0,
            total_probes=0,
            broker_id=broker_id,
            broker_name=broker.name if broker else None,
        )

    summaries = [r.summary for r in runs if r.summary]
    n = len(summaries) or 1

    broker = db.get(Broker, broker_id or runs[0].broker_id)
    total_probes = sum(s.get("total_probes", 0) for s in summaries)

    return DashboardMetrics(
        api_uptime_pct=round(
            sum(s.get("api_uptime_pct", 0) for s in summaries) / n, 1
        ),
        latency_s=round(sum(s.get("latency_s", 0) for s in summaries) / n, 2),
        failed_probes_pct=round(
            sum(s.get("failed_probes_pct", 0) for s in summaries) / n, 1
        ),
        output_speed_tps=round(
            sum(
                s.get("output_speed_tps") or s.get("stream_speed_tps") or 0
                for s in summaries
            )
            / n,
            2,
        ),
        stream_speed_tps=round(
            sum(s.get("stream_speed_tps", 0) for s in summaries) / n, 2
        ),
        real_world_gen_pct=round(
            sum(s.get("real_world_gen_pct", 0) for s in summaries) / n, 1
        ),
        real_spend_per_m=_aggregate_spend(db, broker_id),
        total_runs=len(runs),
        total_probes=total_probes,
        broker_id=broker.id if broker else None,
        broker_name=broker.name if broker else None,
    )
