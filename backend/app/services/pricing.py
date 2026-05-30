from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Callable, Mapping
from urllib.parse import urlparse

import httpx

_CACHE: dict[str, tuple[datetime, dict[str, float], str | None]] = {}
_TTL = timedelta(minutes=5)
_WILDCARD_MODEL = "*"
_HARDCODED_HOST_PRICES = {
    "api.gonkagate.com": 0.000353,
}
_NO_PRICING_HOSTS = {
    "gonka-gateway.mingles.ai",
}


def normalize_model_id(model_id: str) -> str:
    return model_id.strip().lower()


def pricing_origin(base_url: str) -> str:
    parsed = urlparse(base_url.rstrip("/"))
    return f"{parsed.scheme}://{parsed.netloc}"


def lookup_model_price(prices: dict[str, float], model_id: str) -> float | None:
    if not prices:
        return None
    key = normalize_model_id(model_id)
    if key in prices:
        return prices[key]
    if _WILDCARD_MODEL in prices:
        return prices[_WILDCARD_MODEL]
    tail = key.split("/")[-1]
    for candidate, rate in prices.items():
        if candidate.endswith(tail) or tail in candidate:
            return rate
    return None


def extract_completion_billing(
    headers: Mapping[str, str] | None = None,
    payload: dict[str, Any] | None = None,
    *,
    fallback_model: str | None = None,
    fallback_total_tokens: int | None = None,
) -> dict[str, Any] | None:
    """Normalize per-request billing signals from OpenAI-compatible brokers."""
    normalized_headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    payload = payload or {}

    prompt_tokens = _first_number(
        normalized_headers,
        payload,
        header_names=("x-prompt-tokens", "x-input-tokens"),
        body_paths=(("usage", "prompt_tokens"), ("usage", "input_tokens")),
    )
    completion_tokens = _first_number(
        normalized_headers,
        payload,
        header_names=("x-completion-tokens", "x-output-tokens"),
        body_paths=(("usage", "completion_tokens"), ("usage", "output_tokens")),
    )
    total_tokens = _first_number(
        normalized_headers,
        payload,
        header_names=("x-total-tokens",),
        body_paths=(("usage", "total_tokens"), ("total_tokens",)),
    )
    if total_tokens is None and (prompt_tokens is not None or completion_tokens is not None):
        total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)
    if total_tokens is None:
        total_tokens = fallback_total_tokens

    cost_usd = _first_number(
        normalized_headers,
        payload,
        header_names=(
            "x-cost-usd",
            "x-request-cost-usd",
            "x-total-cost-usd",
            "x-usage-cost-usd",
            "x-billing-cost-usd",
            "x-gp-cost-usd",
            "x-gonka-cost-usd",
        ),
        body_paths=(
            ("cost_usd",),
            ("total_cost_usd",),
            ("request_cost_usd",),
            ("estimated_cost_usd",),
            ("usage", "cost_usd"),
            ("usage", "cost"),
            ("usage", "total_cost_usd"),
            ("usage", "estimated_cost_usd"),
            ("billing", "cost_usd"),
            ("billing", "cost"),
            ("billing", "total_cost_usd"),
            ("billing", "estimated_cost_usd"),
        ),
    )
    if cost_usd is None:
        cost_usd = _find_number_by_key(payload, lambda key: "cost" in key and "usd" in key)
    if cost_usd is None:
        cost_cents = _first_number(
            normalized_headers,
            payload,
            header_names=(
                "x-cost-cents",
                "x-request-cost-cents",
                "x-total-cost-cents",
                "x-usage-cost-cents",
                "x-billing-cost-cents",
                "x-gp-cost-cents",
                "x-gonka-cost-cents",
            ),
            body_paths=(
                ("cost_cents",),
                ("total_cost_cents",),
                ("request_cost_cents",),
                ("usage", "cost_cents"),
                ("usage", "total_cost_cents"),
                ("billing", "cost_cents"),
                ("billing", "total_cost_cents"),
            ),
        )
        if cost_cents is None:
            cost_cents = _find_number_by_key(
                payload, lambda key: "cost" in key and ("cent" in key or "cents" in key)
            )
        if cost_cents is not None:
            cost_usd = cost_cents / 100

    rate_per_million = _first_number(
        normalized_headers,
        payload,
        header_names=(
            "x-usd-per-million-tokens",
            "x-rate-usd-per-million-tokens",
            "x-price-usd-per-million-tokens",
            "x-cost-usd-per-million-tokens",
            "x-gp-usd-per-million-tokens",
            "x-gonka-usd-per-million-tokens",
        ),
        body_paths=(
            ("usd_per_million_tokens",),
            ("rate_per_million",),
            ("price_per_million",),
            ("cost_per_million",),
            ("usage", "usd_per_million_tokens"),
            ("usage", "rate_per_million"),
            ("usage", "price_per_million"),
            ("billing", "usd_per_million_tokens"),
            ("billing", "rate_per_million"),
            ("billing", "price_per_million"),
        ),
    )
    if rate_per_million is None:
        rate_per_million = _find_number_by_key(
            payload,
            lambda key: ("per_million" in key or "per_1m" in key)
            and any(term in key for term in ("usd", "price", "rate", "cost")),
        )
    if rate_per_million is None and cost_usd is not None and total_tokens:
        rate_per_million = cost_usd / total_tokens * 1_000_000

    if rate_per_million is None:
        return None

    model = (
        normalized_headers.get("x-model")
        or _get_path(payload, ("model",))
        or fallback_model
    )
    source = "response_headers" if any(k.startswith("x-") for k in normalized_headers) else "response_body"

    billing: dict[str, Any] = {
        "rate_per_million": rate_per_million,
        "source": source,
    }
    if model:
        billing["model"] = str(model)
    if cost_usd is not None:
        billing["cost_usd"] = cost_usd
    if total_tokens is not None:
        billing["total_tokens"] = int(total_tokens)
    if prompt_tokens is not None:
        billing["prompt_tokens"] = int(prompt_tokens)
    if completion_tokens is not None:
        billing["completion_tokens"] = int(completion_tokens)
    return billing


def derived_prices_from_rows(rows: list[dict[str, Any]]) -> dict[str, float]:
    samples: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        model = row.get("model")
        if not model or model == "broker":
            continue
        detail = row.get("detail") or {}
        if not isinstance(detail, dict):
            continue
        billing = detail.get("billing") or {}
        if not isinstance(billing, dict):
            continue
        rate = _as_float(billing.get("rate_per_million"))
        if rate is None or rate <= 0:
            continue
        samples[normalize_model_id(str(model))].append(rate)
        billed_model = billing.get("model")
        if billed_model:
            samples[normalize_model_id(str(billed_model))].append(rate)

    return {model: sum(rates) / len(rates) for model, rates in samples.items() if rates}


def derived_prices_from_result_pairs(
    results: list[tuple[str, dict[str, Any]]],
) -> dict[str, float]:
    rows = [{**item, "model": model} for model, item in results]
    return derived_prices_from_rows(rows)


def merge_prices_with_derived(
    prices: dict[str, float], rows: list[dict[str, Any]]
) -> dict[str, float]:
    merged = derived_prices_from_rows(rows)
    merged.update({normalize_model_id(model): rate for model, rate in prices.items()})
    return merged


def average_price_for_models(
    prices: dict[str, float], model_ids: list[str]
) -> tuple[float | None, float | None]:
    rates = [lookup_model_price(prices, model_id) for model_id in model_ids]
    rates = [rate for rate in rates if rate is not None]
    if not rates:
        return None, None
    avg = sum(rates) / len(rates)
    low, high = min(rates), max(rates)
    return avg, high if high != low else None


def _parse_pricing_payload(data: dict[str, Any]) -> dict[str, float]:
    prices: dict[str, float] = {}
    for item in data.get("models", []):
        model_id = item.get("model_id") or item.get("id")
        rate = item.get("usd_per_million_tokens")
        if model_id and rate is not None:
            prices[normalize_model_id(str(model_id))] = float(rate)
    return prices


def fetch_broker_pricing(base_url: str) -> tuple[dict[str, float], str | None]:
    """Fetch broker pricing from configured overrides or a live /api/pricing endpoint."""
    origin = pricing_origin(base_url)
    cached = _CACHE.get(origin)
    if cached and datetime.utcnow() - cached[0] < _TTL:
        return cached[1], cached[2]

    host = urlparse(origin).netloc.lower()
    hardcoded = _HARDCODED_HOST_PRICES.get(host)
    if hardcoded is not None:
        prices = {_WILDCARD_MODEL: hardcoded}
        source = f"hardcoded:{host}"
        _CACHE[origin] = (datetime.utcnow(), prices, source)
        return prices, source
    if host in _NO_PRICING_HOSTS:
        _CACHE[origin] = (datetime.utcnow(), {}, "no_pricing")
        return {}, "no_pricing"

    prices: dict[str, float] = {}
    source: str | None = None

    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            response = client.get(
                f"{origin}/api/pricing",
                headers={"Accept": "application/json"},
            )
            if response.status_code == 200:
                payload = response.json()
                prices = _parse_pricing_payload(payload)
                if prices:
                    source = f"{origin}/api/pricing"
    except Exception:
        pass

    _CACHE[origin] = (datetime.utcnow(), prices, source)
    return prices, source


def spend_values_for_scope(
    *,
    rows: list[dict[str, Any]],
    model: str | None,
    configured_models: list[str],
    prices: dict[str, float],
) -> dict[str, Any]:
    available_prices = merge_prices_with_derived(prices, rows)
    if not available_prices:
        return {"pricing_available": False}

    if model is not None:
        rate = lookup_model_price(available_prices, model)
        if rate is None:
            return {"pricing_available": False}
        return {
            "pricing_available": True,
            "real_spend_per_m": rate,
            "real_spend_max": rate,
        }

    model_ids = configured_models or sorted(
        {row["model"] for row in rows if row.get("model") not in (None, "broker")}
    )
    avg, high = average_price_for_models(available_prices, model_ids)
    if avg is None:
        return {"pricing_available": False}

    return {
        "pricing_available": True,
        "real_spend_per_m": avg,
        "real_spend_max": high if high is not None else avg,
    }


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _get_path(payload: dict[str, Any], path: tuple[str, ...]) -> Any:
    current: Any = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def _first_number(
    headers: dict[str, str],
    payload: dict[str, Any],
    *,
    header_names: tuple[str, ...],
    body_paths: tuple[tuple[str, ...], ...],
) -> float | None:
    for name in header_names:
        value = _as_float(headers.get(name.lower()))
        if value is not None:
            return value
    for path in body_paths:
        value = _as_float(_get_path(payload, path))
        if value is not None:
            return value
    return None


def _find_number_by_key(payload: Any, predicate: Callable[[str], bool]) -> float | None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            normalized = str(key).strip().lower().replace("-", "_")
            if predicate(normalized):
                number = _as_float(value)
                if number is not None:
                    return number
            nested = _find_number_by_key(value, predicate)
            if nested is not None:
                return nested
    elif isinstance(payload, list):
        for item in payload:
            nested = _find_number_by_key(item, predicate)
            if nested is not None:
                return nested
    return None
