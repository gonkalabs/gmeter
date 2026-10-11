"""Public 24h devshard gateway totals from gonka.gg.

The stats key stays on the server. Brokers absent from this list are not
devshard operators, so the payload simply has no row for them.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()
_CACHE: tuple[datetime, dict[str, Any]] | None = None
_TTL = timedelta(minutes=10)
_URL = "https://gonka.gg/api/v1/devshards/stats/gateways"


def _optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def _optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def get_gateway_stats(hours: int = 24) -> dict[str, Any]:
    global _CACHE
    key = settings.gonka_gg_stats_api_key.strip()
    if not key:
        return {"available": False, "hours": hours, "rows": [], "totals": None}

    now = datetime.utcnow()
    with _LOCK:
        cached = _CACHE
        if cached and now - cached[0] < _TTL and cached[1].get("hours") == hours:
            return cached[1]

    try:
        response = httpx.get(
            _URL,
            params={"hours": hours},
            headers={"X-API-Key": key, "Accept": "application/json"},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        logger.warning("gonka.gg gateway stats request failed")
        return {"available": False, "hours": hours, "rows": [], "totals": None}

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return {"available": False, "hours": hours, "rows": [], "totals": None}

    rows = []
    for row in data.get("rows") or []:
        if not isinstance(row, dict):
            continue
        customers = []
        for broker in row.get("brokers") or []:
            if not isinstance(broker, dict):
                continue
            customers.append(
                {
                    "org_name": str(broker.get("org_name") or ""),
                    "requests": int(broker.get("requests") or 0),
                    "prompt_tokens": int(broker.get("prompt_tokens") or 0),
                    "completion_tokens": int(broker.get("completion_tokens") or 0),
                    "total_tokens": int(broker.get("total_tokens") or 0),
                }
            )
        rows.append(
            {
                "name": str(row.get("name") or ""),
                "host": str(row.get("host") or ""),
                "url": str(row.get("url") or ""),
                "subtitle": str(row.get("subtitle") or ""),
                "split_of": str(row.get("split_of") or "") or None,
                "inferences": _optional_int(row.get("inferences")),
                "confirmed_inferences": _optional_int(row.get("confirmed_inferences")),
                "tokens": int(row.get("tokens") or 0),
                "prompt_tokens": int(row.get("prompt_tokens") or 0),
                "completion_tokens": int(row.get("completion_tokens") or 0),
                "inference_share": _optional_float(row.get("inference_share")),
                "token_share": _optional_float(row.get("token_share")),
                "confirmed_inference_share": _optional_float(row.get("confirmed_inference_share")),
                "brokers": customers,
            }
        )

    totals_raw = data.get("totals") if isinstance(data.get("totals"), dict) else None
    totals = None
    if totals_raw:
        totals = {
            "inferences": int(totals_raw.get("inferences") or 0),
            "confirmed_inferences": int(totals_raw.get("confirmed_inferences") or 0),
            "tokens": int(totals_raw.get("tokens") or 0),
            "prompt_tokens": int(totals_raw.get("prompt_tokens") or 0),
            "completion_tokens": int(totals_raw.get("completion_tokens") or 0),
        }

    result = {"available": True, "hours": int(data.get("hours") or hours), "rows": rows, "totals": totals}
    with _LOCK:
        _CACHE = (datetime.utcnow(), result)
    return result
