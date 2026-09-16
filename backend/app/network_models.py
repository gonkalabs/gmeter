"""Gonka network PoC model availability (epoch 308–309, June 2026)."""

from __future__ import annotations

from dataclasses import dataclass

from app.config import settings
from app.services.pricing import normalize_model_id

NETWORK_UPDATE_URL = "https://gonka.ai/docs/network-updates/#june-26-2026"

KNOWN_MODEL_LABELS: dict[str, str] = {
    "moonshotai/Kimi-K2.6": "Kimi K2.6",
    "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8": "Qwen3 235B FP8",
    "MiniMaxAI/MiniMax-M2.7": "MiniMax M2.7",
    "deepseek-ai/DeepSeek-V4-Flash-0731": "DeepSeek V4 Flash",
    "zai-org/GLM-5.3-Flash": "GLM-5.3 Flash",
    "zai-org/GLM-5.2-FP8": "GLM-5.2 FP8",
    "moonshotai/kimi-k2.6": "Kimi K2.6",
    "qwen/qwen3-235b-a22b-instruct-2507-fp8": "Qwen3 235B FP8",
    "minimaxai/minimax-m2.7": "MiniMax M2.7",
    "deepseek-ai/deepseek-v4-flash-0731": "DeepSeek V4 Flash",
    "zai-org/glm-5.3-flash": "GLM-5.3 Flash",
    "zai-org/glm-5.2-fp8": "GLM-5.2 FP8",
    "gonka/moonshotai/Kimi-K2.6": "Kimi K2.6",
    "gonka/Qwen/Qwen3-235B-A22B-Instruct-2507-FP8": "Qwen3 235B FP8",
    "gonka/MiniMaxAI/MiniMax-M2.7": "MiniMax M2.7",
    "gonka/deepseek-ai/DeepSeek-V4-Flash-0731": "DeepSeek V4 Flash",
    "gonka/zai-org/GLM-5.3-Flash": "GLM-5.3 Flash",
    "gonka/zai-org/GLM-5.2-FP8": "GLM-5.2 FP8",
    "kimi-k2.6": "Kimi K2.6",
    "minimax-m2.7": "MiniMax M2.7",
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "glm-5.3-flash": "GLM-5.3 Flash",
    "glm-5.3": "GLM-5.3 Flash",
    "glm-5.2": "GLM-5.2 FP8",
}

OPTIONAL_MODEL_PATTERNS = ("glm-5.2",)


@dataclass(frozen=True)
class NetworkModelStatus:
    model_id: str
    label: str
    active: bool
    status_note: str | None = None


def split_model_csv(raw: str | None) -> list[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


DEPRECATED_MODEL_PATTERNS = ("kimi-k2.6", "kimi-k2")


def active_model_ids() -> list[str]:
    defaults = [
        "MiniMaxAI/MiniMax-M2.7",
        "deepseek-ai/DeepSeek-V4-Flash-0731",
        "zai-org/GLM-5.3-Flash",
    ]
    return split_model_csv(settings.active_models) or defaults


def known_model_ids() -> list[str]:
    raw = settings.known_models.strip() if settings.known_models else settings.default_models
    return split_model_csv(raw) or [
        "moonshotai/Kimi-K2.6",
        "MiniMaxAI/MiniMax-M2.7",
        "deepseek-ai/DeepSeek-V4-Flash-0731",
        "zai-org/GLM-5.3-Flash",
        "zai-org/GLM-5.2-FP8",
        "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8",
    ]


def _active_normalized() -> set[str]:
    return {normalize_model_id(model_id) for model_id in active_model_ids()}


def _tails_compatible(left: str, right: str) -> bool:
    if left == right:
        return True
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    return bool(shorter) and longer.startswith(f"{shorter}-")


def is_active_model(model_id: str) -> bool:
    if is_deprecated_model(model_id):
        return False
    normalized = normalize_model_id(model_id)
    active = _active_normalized()
    if normalized in active:
        return True
    tail = normalized.split("/")[-1]
    return any(
        _tails_compatible(tail, normalize_model_id(item).split("/")[-1])
        for item in active_model_ids()
    )


def is_optional_model(model_id: str) -> bool:
    normalized = normalize_model_id(model_id)
    return any(pattern in normalized for pattern in OPTIONAL_MODEL_PATTERNS)


def is_deprecated_model(model_id: str) -> bool:
    normalized = normalize_model_id(model_id)
    return any(pattern in normalized for pattern in DEPRECATED_MODEL_PATTERNS)


def filter_active_models(model_ids: list[str]) -> list[str]:
    return [model_id for model_id in model_ids if is_active_model(model_id)]


def label_for_network_model(model_id: str) -> str:
    return KNOWN_MODEL_LABELS.get(model_id) or KNOWN_MODEL_LABELS.get(
        model_id.replace("gonka/", "")
    ) or model_id.split("/")[-1]


def network_model_catalog() -> list[NetworkModelStatus]:
    active = _active_normalized()
    catalog: list[NetworkModelStatus] = []
    seen: set[str] = set()

    for model_id in known_model_ids():
        key = normalize_model_id(model_id)
        if key in seen:
            continue
        seen.add(key)
        is_active = is_active_model(model_id) and not is_deprecated_model(model_id)
        note = None
        if is_deprecated_model(model_id):
            note = "Deprecated — disabled in tests; historical probe data is kept."
        elif is_active and is_optional_model(model_id):
            note = "Optional PoC model from epoch 309 — hosts opt in; broker availability varies."
        elif not is_active:
            if is_optional_model(model_id):
                note = (
                    "Optional PoC model added at epoch 309, but no broker currently lists a "
                    "live host — probing is paused until it reappears."
                )
            elif "qwen" in key:
                note = "Removed at epoch 308; not active on the network."
            else:
                note = "Not active on the network."
        catalog.append(
            NetworkModelStatus(
                model_id=model_id,
                label=label_for_network_model(model_id),
                active=is_active,
                status_note=note,
            )
        )

    return sorted(catalog, key=lambda item: (not item.active, item.label.lower()))


def network_notice() -> str:
    catalog = network_model_catalog()
    required = [
        item.label for item in catalog if item.active and not is_optional_model(item.model_id)
    ]
    optional_active = [
        item.label for item in catalog if item.active and is_optional_model(item.model_id)
    ]
    optional_unavailable = [
        item.label
        for item in catalog
        if not item.active and is_optional_model(item.model_id)
    ]
    deprecated = [
        item.label
        for item in catalog
        if is_deprecated_model(item.model_id)
    ]
    retired = [
        item.label
        for item in catalog
        if not item.active
        and not is_optional_model(item.model_id)
        and not is_deprecated_model(item.model_id)
    ]

    if not optional_active and not optional_unavailable and not retired:
        return ""

    parts: list[str] = []
    if required:
        req_text = ", ".join(required)
        parts.append(f"{req_text} {'is' if len(required) == 1 else 'are'} active PoC model(s).")
    if optional_active:
        opt_text = ", ".join(optional_active)
        parts.append(
            f"{opt_text} is an optional PoC model (voluntary for hosts; not every broker lists it)."
        )
    if optional_unavailable:
        opt_text = ", ".join(optional_unavailable)
        parts.append(
            f"{opt_text} is an optional PoC model with no live hosts right now — not being probed."
        )
    if deprecated:
        dep_text = ", ".join(deprecated)
        verb = "is" if len(deprecated) == 1 else "are"
        parts.append(f"{dep_text} {verb} deprecated and no longer probed.")
    if retired:
        retired_text = ", ".join(retired)
        verb = "is" if len(retired) == 1 else "are"
        parts.append(f"{retired_text} {verb} retired — historical probe data is kept.")

    return "From Gonka epoch 309 onward (DeepSeek V4 Flash and GLM-5.3 Flash added later), " + " ".join(parts)
