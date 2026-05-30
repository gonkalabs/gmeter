from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Broker, ProbeResult, ProbeRun
from app.probes.client import GonkaClient
from app.probes.suite import (
    pricing_probe_from_rate,
    run_model_suite,
    test_connectivity,
    test_pricing_probe,
)
from app.services.metrics import compute_run_summary
from app.services.model_catalog import resolve_model_ids
from app.services.pricing import (
    average_price_for_models,
    derived_prices_from_result_pairs,
    fetch_broker_pricing,
    lookup_model_price,
    normalize_model_id,
)


def run_probe_suite(
    db: Session,
    broker: Broker,
    *,
    models: list[str] | None = None,
    mode: str = "quick",
    existing_run: ProbeRun | None = None,
) -> ProbeRun:
    if existing_run:
        run = existing_run
        run.status = "running"
        run.run_type = mode
        run.error = None
        run.summary = None
        run.finished_at = None
        db.query(ProbeResult).filter(ProbeResult.run_id == run.id).delete()
        db.commit()
    else:
        run = ProbeRun(broker_id=broker.id, status="running", run_type=mode)
        db.add(run)
        db.commit()
        db.refresh(run)

    model_list = resolve_model_ids(broker, models)
    client = GonkaClient(broker.base_url, broker.api_key)
    all_results: list[tuple[str, dict[str, Any]]] = []
    prices, pricing_source = fetch_broker_pricing(broker.base_url)

    try:
        conn = test_connectivity(client)
        all_results.append(("broker", conn))

        for model in model_list:
            rate = lookup_model_price(prices, model)
            if rate is not None:
                all_results.append(
                    (
                        model,
                        pricing_probe_from_rate(
                            model, rate, pricing_source or "api_pricing"
                        ),
                    )
                )
            else:
                all_results.append((model, test_pricing_probe(client, model)))
            for item in run_model_suite(
                client,
                model,
                min_output_tokens=settings.min_output_tokens,
                mode=mode,
            ):
                all_results.append((model, item))

        for model, item in all_results:
            db.add(
                ProbeResult(
                    run_id=run.id,
                    model=model,
                    test_name=item["test_name"],
                    ok=item["ok"],
                    latency_s=item.get("latency_s"),
                    ttft_s=item.get("ttft_s"),
                    tps=item.get("tps"),
                    stream_tps=item.get("stream_tps"),
                    tokens_in=item.get("tokens_in"),
                    tokens_out=item.get("tokens_out"),
                    detail=item.get("detail"),
                    error=item.get("error"),
                    gonka_limitation=item.get("gonka_limitation", False),
                )
            )

        derived_prices = derived_prices_from_result_pairs(all_results)
        merged_prices = dict(derived_prices)
        merged_prices.update({normalize_model_id(model): rate for model, rate in prices.items()})
        avg_price, _ = average_price_for_models(merged_prices, model_list)
        run.summary = compute_run_summary(
            all_results, avg_price if avg_price is not None else None
        )
        run.status = "completed"
        run.finished_at = datetime.utcnow()
        db.commit()
        db.refresh(run)
        return run
    except Exception as e:
        run.status = "failed"
        run.error = str(e)[:500]
        run.finished_at = datetime.utcnow()
        db.commit()
        raise


def mask_api_key(key: str) -> str:
    if len(key) <= 8:
        return "****"
    return f"{key[:6]}…{key[-4:]}"
