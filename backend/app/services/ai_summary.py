"""Generate cached network/broker status summaries via DeepSeek on proxy.gonka.gg."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models import AiSummary, Broker, ProbeRun
from app.services.model_catalog import broker_model_aliases, label_for_model

logger = logging.getLogger(__name__)

NETWORK_SCOPE = "network"
BROKER_SCOPE = "broker"


def _summary_client() -> tuple[str, str, str] | None:
    if not settings.ai_summary_enabled:
        return None
    base = (
        settings.ai_summary_base_url.strip()
        or os.environ.get("GONKA_BASE_URL", "https://api.proxy.gonka.gg/v1")
    ).rstrip("/")
    key = settings.ai_summary_api_key.strip() or os.environ.get("GONKA_API_KEY", "")
    model = settings.ai_summary_model.strip() or "deepseek-ai/DeepSeek-V4-Flash-0731"
    if not key:
        return None
    return base, key, model


def _health_tone(summary: dict[str, Any] | None, has_run: bool) -> str:
    if not has_run or not summary:
        return "unknown"
    uptime = float(summary.get("api_uptime_pct") or 0)
    failed = float(summary.get("failed_probes_pct") or 0)
    if uptime <= 0:
        return "down"
    if failed > 5 or uptime < 95:
        return "degraded"
    return "healthy"


def _broker_snapshot(db: Session, broker: Broker) -> dict[str, Any]:
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
    summary = (run.summary if run else None) or {}
    aliases = broker_model_aliases(broker)
    model_notes: list[dict[str, Any]] = []
    if run:
        by_model: dict[str, list] = {}
        for result in run.results:
            if result.model == "broker":
                continue
            by_model.setdefault(result.model, []).append(result)
        for model_id, rows in by_model.items():
            total = len(rows)
            failed = sum(1 for r in rows if not r.ok)
            errors = [r.error for r in rows if r.error][:3]
            failed_tests = sorted({r.test_name for r in rows if not r.ok})
            latencies = [r.latency_s for r in rows if r.latency_s is not None]
            speeds = [r.tps or r.stream_tps for r in rows if (r.tps or r.stream_tps)]
            model_notes.append(
                {
                    "model": label_for_model(model_id, aliases),
                    "checks": total,
                    "failed_checks": failed,
                    "fail_pct": round(100.0 * failed / total, 1) if total else 0,
                    "failed_tests": failed_tests,
                    "avg_latency_s": round(sum(latencies) / len(latencies), 2) if latencies else None,
                    "avg_tps": round(sum(speeds) / len(speeds), 1) if speeds else None,
                    "sample_errors": errors,
                }
            )

    return {
        "broker_id": broker.id,
        "name": broker.name,
        "host": broker.base_url,
        "health": _health_tone(summary if isinstance(summary, dict) else None, bool(run)),
        "api_uptime_pct": summary.get("api_uptime_pct") if isinstance(summary, dict) else None,
        "failed_probes_pct": summary.get("failed_probes_pct") if isinstance(summary, dict) else None,
        "latency_s": summary.get("latency_s") if isinstance(summary, dict) else None,
        "output_speed_tps": (
            (summary.get("output_speed_tps") or summary.get("stream_speed_tps"))
            if isinstance(summary, dict)
            else None
        ),
        "checked_at": (run.finished_at or run.started_at).isoformat() if run else None,
        "models": model_notes,
    }


def build_status_snapshot(db: Session) -> dict[str, Any]:
    brokers = (
        db.query(Broker)
        .filter(Broker.enabled.is_(True))
        .order_by(Broker.name)
        .all()
    )
    broker_rows = [_broker_snapshot(db, broker) for broker in brokers]
    healthy = sum(1 for row in broker_rows if row["health"] == "healthy")
    degraded = sum(1 for row in broker_rows if row["health"] == "degraded")
    down = sum(1 for row in broker_rows if row["health"] == "down")
    return {
        "generated_for": "gmeter",
        "prompt_version": 2,
        "broker_count": len(broker_rows),
        "healthy": healthy,
        "degraded": degraded,
        "down": down,
        "glossary": {
            "billing unavailable": (
                "The broker answered inference requests, but G-Meter could not read a live "
                "USD/token price from the response headers or /pricing metadata. This usually "
                "means cost gauges may be blank — it is not by itself an inference outage."
            ),
            "pricing_probe": (
                "A check that asks whether the broker exposes usable pricing/billing signals "
                "for spend estimation."
            ),
            "failed_probes_pct": (
                "Share of non-pricing probe steps that failed in the latest quick run "
                "(latency, output, tools, JSON, etc.)."
            ),
            "api_uptime": "Whether GET /models (connectivity) succeeded for the broker gateway.",
        },
        "brokers": broker_rows,
    }


def _snapshot_hash(snapshot: dict[str, Any]) -> str:
    payload = json.dumps(snapshot, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:40]


def _extract_json(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _call_deepseek(base_url: str, api_key: str, model: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    broker_names = [b["name"] for b in snapshot.get("brokers") or []]
    system = (
        "You are the status analyst for G-Meter, a Gonka network broker observability dashboard. "
        "Write clear, insightful English for operators. Use only the provided probe metrics and glossary. "
        "Explain jargon in plain language when it appears (especially billing unavailable, auth errors, "
        "credits/tokens exhausted, rate limits, model not available). "
        "Do not invent outages. Distinguish inference health from pricing/metadata gaps. "
        "Return JSON only."
    )
    user = {
        "instruction": (
            "Write richer status copy for the current Gonka broker set.\n"
            "- network: 4-6 sentences. Cover overall health mix, the main recurring issues, "
            "and what operators should take away right now.\n"
            "- brokers: map each broker name to a short paragraph of 3-5 sentences "
            "(about 60-110 words). Include latency/speed when useful, call out failing tests, "
            "and explain what any error means for users (e.g. if billing is unavailable, say "
            "inference may still work but live cost estimates are missing).\n"
            "Use these exact broker name keys: " + ", ".join(broker_names)
        ),
        "schema": {
            "network": "string",
            "brokers": {name: "string" for name in broker_names},
        },
        "data": snapshot,
    }
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ],
        "temperature": 0.25,
        "max_tokens": 3500,
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=120) as client:
        resp = client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    content = (
        ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    )
    parsed = _extract_json(content)
    if not parsed:
        raise ValueError(f"AI summary response was not JSON: {content[:240]}")
    return parsed


def _upsert(
    db: Session,
    *,
    scope: str,
    broker_id: int | None,
    text: str,
    model: str,
    source_hash: str,
) -> None:
    query = db.query(AiSummary).filter(AiSummary.scope == scope)
    if broker_id is None:
        query = query.filter(AiSummary.broker_id.is_(None))
    else:
        query = query.filter(AiSummary.broker_id == broker_id)
    row = query.first()
    now = datetime.utcnow()
    if row:
        row.text = text
        row.model = model
        row.source_hash = source_hash
        row.generated_at = now
    else:
        db.add(
            AiSummary(
                scope=scope,
                broker_id=broker_id,
                text=text,
                model=model,
                source_hash=source_hash,
                generated_at=now,
            )
        )


def get_network_summary(db: Session) -> AiSummary | None:
    return (
        db.query(AiSummary)
        .filter(AiSummary.scope == NETWORK_SCOPE, AiSummary.broker_id.is_(None))
        .order_by(desc(AiSummary.generated_at))
        .first()
    )


def get_broker_summaries(db: Session) -> dict[int, AiSummary]:
    rows = db.query(AiSummary).filter(AiSummary.scope == BROKER_SCOPE).all()
    return {row.broker_id: row for row in rows if row.broker_id is not None}


def refresh_ai_summaries(db: Session, *, force: bool = False) -> bool:
    client = _summary_client()
    if not client:
        return False
    base_url, api_key, model = client
    snapshot = build_status_snapshot(db)
    if not snapshot.get("brokers"):
        return False
    source_hash = _snapshot_hash(snapshot)
    existing = get_network_summary(db)
    if not force and existing and existing.source_hash == source_hash and existing.text.strip():
        return False

    try:
        parsed = _call_deepseek(base_url, api_key, model, snapshot)
    except Exception:
        logger.exception("AI summary generation failed")
        return False

    network_text = str(parsed.get("network") or "").strip()
    broker_map = parsed.get("brokers") if isinstance(parsed.get("brokers"), dict) else {}
    if not network_text:
        logger.warning("AI summary missing network text")
        return False

    _upsert(
        db,
        scope=NETWORK_SCOPE,
        broker_id=None,
        text=network_text,
        model=model,
        source_hash=source_hash,
    )
    by_name = {row["name"]: row["broker_id"] for row in snapshot["brokers"]}
    for name, broker_id in by_name.items():
        text = str(broker_map.get(name) or "").strip()
        if not text:
            # fuzzy: case-insensitive key match
            for key, value in broker_map.items():
                if str(key).strip().lower() == name.lower():
                    text = str(value).strip()
                    break
        if not text:
            health = next(
                (row["health"] for row in snapshot["brokers"] if row["broker_id"] == broker_id),
                "unknown",
            )
            text = f"Latest probes look {health}; waiting for a richer AI write-up."
        _upsert(
            db,
            scope=BROKER_SCOPE,
            broker_id=broker_id,
            text=text,
            model=model,
            source_hash=source_hash,
        )
    db.commit()
    return True
