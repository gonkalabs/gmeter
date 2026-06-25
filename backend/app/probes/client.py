import json
import time
from typing import Any

import httpx

from app.services.pricing import extract_completion_billing


class GonkaClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 120):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def probe_endpoint(self) -> dict[str, Any]:
        url = f"{self.base_url}/models"
        t0 = time.time()
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.get(url, headers=self._headers())
                elapsed = time.time() - t0
                resp.raise_for_status()
                body = resp.json()
                names = [m.get("id") for m in body.get("data", [])[:5]]
                return {
                    "ok": True,
                    "elapsed": round(elapsed, 2),
                    "models": names,
                    "response": json.dumps(body, ensure_ascii=False)[:1800],
                }
        except httpx.HTTPStatusError as e:
            return {
                "ok": False,
                "elapsed": round(time.time() - t0, 2),
                "error": str(e)[:200],
                "response": e.response.text[:1800],
            }
        except Exception as e:
            return {
                "ok": False,
                "elapsed": round(time.time() - t0, 2),
                "error": str(e)[:200],
            }

    def post(
        self, payload: dict, timeout: float | None = None
    ) -> tuple[dict | None, float, str | None, str | None, dict[str, Any] | None]:
        url = f"{self.base_url}/chat/completions"
        t0 = time.time()
        try:
            with httpx.Client(timeout=timeout or self.timeout) as client:
                resp = client.post(url, headers=self._headers(), json=payload)
                elapsed = time.time() - t0
                if resp.status_code >= 400:
                    body = resp.text[:1800]
                    return None, elapsed, f"HTTP {resp.status_code}: {body[:300]}", body, None
                text = resp.text[:1800]
                data = resp.json()
                billing = extract_completion_billing(
                    resp.headers,
                    data,
                    fallback_model=payload.get("model"),
                )
                return data, elapsed, None, text, billing
        except Exception as e:
            return None, time.time() - t0, str(e)[:200], None, None

    def stream_measure(
        self, payload: dict, timeout: float | None = None
    ) -> tuple[float | None, float, int, str | None, str | None, dict[str, Any] | None]:
        url = f"{self.base_url}/chat/completions"
        t0 = time.time()
        ttft: float | None = None
        token_count = 0
        sample_parts: list[str] = []
        error_body: str | None = None
        response_headers: httpx.Headers | None = None
        try:
            with httpx.Client(timeout=timeout or self.timeout) as client:
                with client.stream(
                    "POST",
                    url,
                    headers=self._headers(),
                    json={**payload, "stream": True},
                ) as resp:
                    response_headers = resp.headers
                    if resp.status_code >= 400:
                        error_body = resp.read().decode()[:1800]
                        return None, time.time() - t0, 0, f"HTTP {resp.status_code}: {error_body[:300]}", error_body, None
                    for line in resp.iter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload_text = line[5:].strip()
                        if payload_text == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(payload_text)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}) or {}
                            content = (
                                delta.get("content")
                                or delta.get("reasoning")
                                or delta.get("reasoning_content")
                                or ""
                            )
                            if content:
                                if ttft is None:
                                    ttft = time.time() - t0
                                token_count += 1
                                if len("".join(sample_parts)) < 400:
                                    sample_parts.append(content)
                        except Exception:
                            pass
            sample = "".join(sample_parts)
            response = json.dumps(
                {
                    "stream": True,
                    "tokens_approx": token_count,
                    "sample": sample,
                },
                ensure_ascii=False,
            )
            billing = extract_completion_billing(
                response_headers,
                None,
                fallback_model=payload.get("model"),
                fallback_total_tokens=token_count or None,
            )
            if token_count == 0:
                return ttft, time.time() - t0, 0, "empty stream", response, billing
            return ttft, time.time() - t0, token_count, None, response, billing
        except Exception as e:
            return ttft, time.time() - t0, token_count, str(e)[:150], error_body, None

    def stream_completion(
        self, payload: dict, timeout: float | None = None
    ) -> tuple[
        float | None,
        float,
        int,
        int | None,
        str | None,
        str | None,
        dict[str, Any] | None,
    ]:
        """Measure a long streamed completion without storing the full response."""
        url = f"{self.base_url}/chat/completions"
        t0 = time.time()
        ttft: float | None = None
        chunk_count = 0
        char_count = 0
        word_count = 0
        sample_parts: list[str] = []
        finish_reason: str | None = None
        usage: dict[str, Any] | None = None
        error_body: str | None = None
        response_headers: httpx.Headers | None = None
        try:
            with httpx.Client(timeout=timeout or self.timeout) as client:
                with client.stream(
                    "POST",
                    url,
                    headers=self._headers(),
                    json={**payload, "stream": True},
                ) as resp:
                    response_headers = resp.headers
                    if resp.status_code >= 400:
                        error_body = resp.read().decode()[:1800]
                        return (
                            None,
                            time.time() - t0,
                            0,
                            None,
                            f"HTTP {resp.status_code}: {error_body[:300]}",
                            error_body,
                            None,
                        )
                    for line in resp.iter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload_text = line[5:].strip()
                        if payload_text == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(payload_text)
                        except Exception:
                            continue

                        if isinstance(chunk.get("error"), dict):
                            error_body = json.dumps(chunk, ensure_ascii=False)[:1800]
                            message = chunk["error"].get("message") or error_body
                            return (
                                ttft,
                                time.time() - t0,
                                0,
                                None,
                                str(message)[:300],
                                error_body,
                                None,
                            )

                        if isinstance(chunk.get("usage"), dict):
                            usage = chunk["usage"]

                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        choice = choices[0] or {}
                        finish_reason = choice.get("finish_reason") or finish_reason
                        delta = choice.get("delta") or {}
                        message = choice.get("message") or {}
                        content = (
                            delta.get("content")
                            or delta.get("reasoning")
                            or delta.get("reasoning_content")
                            or message.get("content")
                            or ""
                        )
                        if isinstance(content, list):
                            content = "".join(
                                str(item.get("text") or "") if isinstance(item, dict) else str(item)
                                for item in content
                            )
                        if not content:
                            continue
                        if ttft is None:
                            ttft = time.time() - t0
                        chunk_count += 1
                        content = str(content)
                        char_count += len(content)
                        word_count += len(content.split())
                        if len("".join(sample_parts)) < 1800:
                            sample_parts.append(content)

            usage_completion = usage.get("completion_tokens") if usage else None
            usage_prompt = usage.get("prompt_tokens") if usage else None
            if isinstance(usage_completion, int) and usage_completion > 0:
                tokens_out = usage_completion
                token_source = "usage"
            else:
                tokens_out = max(word_count, round(char_count / 4)) if char_count else 0
                token_source = "approx_chars"

            response = json.dumps(
                {
                    "stream": True,
                    "tokens_out": tokens_out,
                    "tokens_source": token_source,
                    "chunks": chunk_count,
                    "chars": char_count,
                    "words": word_count,
                    "finish_reason": finish_reason,
                    "usage": usage,
                    "sample": "".join(sample_parts)[:1800],
                },
                ensure_ascii=False,
            )
            billing = extract_completion_billing(
                response_headers,
                {"usage": usage or {}},
                fallback_model=payload.get("model"),
                fallback_total_tokens=(
                    usage.get("total_tokens")
                    if usage and isinstance(usage.get("total_tokens"), int)
                    else tokens_out or None
                ),
            )
            if tokens_out == 0:
                return ttft, time.time() - t0, 0, usage_prompt, "empty stream", response, billing
            return ttft, time.time() - t0, tokens_out, usage_prompt, None, response, billing
        except Exception as e:
            tokens_out = max(word_count, round(char_count / 4)) if char_count else 0
            response = None
            if tokens_out:
                response = json.dumps(
                    {
                        "stream": True,
                        "tokens_out": tokens_out,
                        "tokens_source": "partial_approx_chars",
                        "chunks": chunk_count,
                        "chars": char_count,
                        "words": word_count,
                        "finish_reason": finish_reason,
                        "usage": usage,
                        "sample": "".join(sample_parts)[:1800],
                    },
                    ensure_ascii=False,
                )
            return ttft, time.time() - t0, tokens_out, None, str(e)[:150], response or error_body, None
