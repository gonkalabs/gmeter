from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import Broker, ProbeRun
from app.schemas import LimitLadderStep, LimitsDetail, ModelLimits, ProviderLimits
from app.services.model_catalog import broker_model_aliases, label_for_model


def get_limits_detail(db: Session) -> LimitsDetail:
    providers: list[ProviderLimits] = []

    for broker in db.query(Broker).filter(Broker.enabled.is_(True)).order_by(Broker.name):
        aliases = broker_model_aliases(broker)
        run = (
            db.query(ProbeRun)
            .options(joinedload(ProbeRun.results))
            .filter(
                ProbeRun.broker_id == broker.id,
                ProbeRun.status == "completed",
                ProbeRun.run_type == "limits",
            )
            .order_by(desc(ProbeRun.finished_at))
            .first()
        )

        if not run:
            providers.append(
                ProviderLimits(
                    broker_id=broker.id,
                    broker_name=broker.name,
                    base_url=broker.base_url,
                )
            )
            continue

        model_ids = sorted({r.model for r in run.results if r.model != "broker"})
        models: list[ModelLimits] = []

        for model_id in model_ids:
            max_in = next(
                (r for r in run.results if r.model == model_id and r.test_name == "max_input"),
                None,
            )
            max_out = next(
                (r for r in run.results if r.model == model_id and r.test_name == "max_output"),
                None,
            )

            ladder: list[LimitLadderStep] = []
            max_k = 0
            if max_in and max_in.detail:
                max_k = max_in.detail.get("max_ok_k", 0)
                for step in max_in.detail.get("results", []):
                    ladder.append(
                        LimitLadderStep(
                            label=step.get("label", "?"),
                            ok=bool(step.get("ok")),
                            ttft=step.get("ttft"),
                            error=step.get("error"),
                        )
                    )

            tokens_out = 0
            if max_out:
                if max_out.tokens_out:
                    tokens_out = max_out.tokens_out
                elif max_out.detail:
                    tokens_out = max_out.detail.get("tokens_out", 0) or 0

            models.append(
                ModelLimits(
                    model=model_id,
                    label=label_for_model(model_id, aliases),
                    max_input_ok=bool(max_in.ok) if max_in else False,
                    max_input_k=max_k,
                    max_input_ladder=ladder,
                    max_input_error=max_in.error if max_in else "not tested",
                    max_output_ok=bool(max_out.ok) if max_out else False,
                    max_output_tokens=tokens_out or 0,
                    max_output_required=settings.min_output_tokens,
                    max_output_error=max_out.error if max_out else "not tested",
                    gonka_limitation=bool(
                        (max_in and max_in.gonka_limitation)
                        or (max_out and max_out.gonka_limitation)
                    ),
                )
            )

        providers.append(
            ProviderLimits(
                broker_id=broker.id,
                broker_name=broker.name,
                base_url=broker.base_url,
                run_id=run.id,
                measured_at=run.finished_at,
                models=models,
            )
        )

    return LimitsDetail(
        min_output_required=settings.min_output_tokens,
        limits_interval_minutes=settings.limits_interval_minutes,
        providers=providers,
    )
