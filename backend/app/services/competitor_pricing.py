from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Literal

import httpx

from app.config import settings
from app.services.pricing import normalize_model_id

_OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models"
_OPENROUTER_ENDPOINTS = "https://openrouter.ai/api/v1/models/{slug}/endpoints"
_CACHE: tuple[datetime, dict[str, Any]] | None = None
_TTL = timedelta(minutes=5)

_VARIANT_LOOKUPS: dict[str, list[str]] = {
    normalize_model_id("Qwen/Qwen3-235B-A22B-Instruct-2507-FP8"): [
        "Qwen/Qwen3-235B-A22B-Instruct-2507",
        "Qwen/Qwen3-235B-A22B-Instruct",
        "Qwen/Qwen3-235B-A22B",
    ],
}


def _friendly_label(model_id: str) -> str:
    tail = model_id.split("/")[-1]
    labels = {
        "Kimi-K2.6": "Kimi K2.6",
        "Qwen3-235B-A22B-Instruct-2507-FP8": "Qwen3 235B FP8",
        "MiniMax-M2.7": "MiniMax M2.7",
    }
    return labels.get(tail, tail.replace("-", " "))


def _gonka_model_ids() -> list[str]:
    return [model.strip() for model in settings.default_models.split(",") if model.strip()]


def _per_million(token_price: Any) -> float | None:
    if token_price is None:
        return None
    try:
        value = float(token_price)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return round(value * 1_000_000, 6)


def _find_openrouter_slug(models: list[dict[str, Any]], lookup_id: str) -> str | None:
    target = normalize_model_id(lookup_id)
    for item in models:
        model_id = normalize_model_id(str(item.get("id") or ""))
        hugging_face_id = normalize_model_id(str(item.get("hugging_face_id") or ""))
        if model_id == target or hugging_face_id == target:
            return str(item["id"])
    return None


def _lookup_targets(gonka_id: str) -> list[tuple[str, Literal["exact", "variant"]]]:
    targets: list[tuple[str, Literal["exact", "variant"]]] = [(gonka_id, "exact")]
    for variant_id in _VARIANT_LOOKUPS.get(normalize_model_id(gonka_id), []):
        if normalize_model_id(variant_id) == normalize_model_id(gonka_id):
            continue
        targets.append((variant_id, "variant"))
    return targets


def _fetch_json(client: httpx.Client, url: str) -> dict[str, Any]:
    response = client.get(url, timeout=30.0)
    response.raise_for_status()
    return response.json()


def _fetch_competitors(
    client: httpx.Client,
    openrouter_models: list[dict[str, Any]],
    gonka_id: str,
) -> tuple[str | None, list[str], list[str], list[dict[str, Any]]]:
    exact_slug: str | None = None
    variants_searched = _VARIANT_LOOKUPS.get(normalize_model_id(gonka_id), [])
    variants_found: set[str] = set()
    seen: dict[str, dict[str, Any]] = {}

    for lookup_id, match_type in _lookup_targets(gonka_id):
        slug = _find_openrouter_slug(openrouter_models, lookup_id)
        if not slug:
            continue
        if match_type == "exact":
            exact_slug = slug
        else:
            variants_found.add(lookup_id)

        try:
            endpoints_payload = _fetch_json(
                client,
                _OPENROUTER_ENDPOINTS.format(slug=slug),
            )
        except httpx.HTTPError:
            continue

        endpoints = (endpoints_payload.get("data") or {}).get("endpoints") or []
        for endpoint in endpoints:
            provider = str(endpoint.get("provider_name") or "").strip()
            if not provider:
                continue
            pricing = endpoint.get("pricing") or {}
            output_per_m = _per_million(pricing.get("completion"))
            if output_per_m is None:
                continue
            row = {
                "provider": provider,
                "model_id": lookup_id,
                "match_type": match_type,
                "input_per_m": _per_million(pricing.get("prompt")),
                "output_per_m": output_per_m,
                "source": f"https://openrouter.ai/{slug}",
                "source_label": "OpenRouter",
            }
            key = f"{provider.lower()}::{normalize_model_id(lookup_id)}"
            existing = seen.get(key)
            if existing is None or output_per_m < existing["output_per_m"]:
                seen[key] = row

    competitors = sorted(seen.values(), key=lambda item: item["output_per_m"])
    return exact_slug, variants_searched, sorted(variants_found), competitors


def get_pricing_comparison() -> dict[str, Any]:
    global _CACHE
    now = datetime.utcnow()
    if _CACHE and now - _CACHE[0] < _TTL:
        return _CACHE[1]

    gonka_models = _gonka_model_ids()
    comparison_models: list[dict[str, Any]] = []

    with httpx.Client(headers={"User-Agent": "gmeter/1.0"}) as client:
        payload = _fetch_json(client, _OPENROUTER_MODELS)
        openrouter_models = payload.get("data") or []

        for gonka_id in gonka_models:
            exact_slug, variants_searched, variants_found, competitors = _fetch_competitors(
                client,
                openrouter_models,
                gonka_id,
            )
            comparison_models.append(
                {
                    "model_id": gonka_id,
                    "label": _friendly_label(gonka_id),
                    "openrouter_slug": exact_slug,
                    "variant_ids_searched": variants_searched,
                    "variants_found": variants_found,
                    "competitors": competitors,
                    "no_exact_listing": exact_slug is None,
                }
            )

    result = {
        "checked_at": now,
        "source": "openrouter",
        "models": comparison_models,
    }
    _CACHE = (now, result)
    return result
