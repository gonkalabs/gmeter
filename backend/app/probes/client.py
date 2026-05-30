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
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        try:
                            chunk = json.loads(line[6:])
                            content = (
                                chunk.get("choices", [{}])[0]
                                .get("delta", {})
                                .get("content", "")
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
