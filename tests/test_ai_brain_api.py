from pathlib import Path

from fastapi.testclient import TestClient

from app.ai import providers as provider_module
from app.config import Settings
from app.main import create_app


def _clear_ai_env(monkeypatch):
    for name in (
        "NEETPG2027_OPENAI_API_KEY",
        "NEETPG2027_OPENAI_MODEL",
        "NEETPG2027_GEMINI_API_KEY",
        "NEETPG2027_GEMINI_MODEL",
        "NEETPG2027_ANTHROPIC_API_KEY",
        "NEETPG2027_ANTHROPIC_MODEL",
        "NEETPG2027_OPENAI_COMPATIBLE_BASE_URL",
        "NEETPG2027_OPENAI_COMPATIBLE_API_KEY",
        "NEETPG2027_OPENAI_COMPATIBLE_MODEL",
        "NEETPG2027_AI_ACCESS_TOKEN",
        "NEETPG2027_CORS_ORIGINS",
    ):
        monkeypatch.delenv(name, raising=False)


def test_provider_status_is_safe_by_default(monkeypatch, tmp_path):
    _clear_ai_env(monkeypatch)
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'ai.sqlite3'}")

    with TestClient(create_app()) as client:
        response = client.get("/ai/providers")

    assert response.status_code == 200
    data = response.json()
    assert data["local_evidence"] is True
    assert data["gateway_ready"] is False
    assert data["gateway_authorized"] is False
    assert all(row["configured"] is False for row in data["providers"])
    assert "api_key" not in response.text.lower()


def test_openai_generation_requires_gateway_token_and_keeps_provider_key_server_side(monkeypatch, tmp_path):
    _clear_ai_env(monkeypatch)
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'ai.sqlite3'}")
    monkeypatch.setenv("NEETPG2027_AI_ACCESS_TOKEN", "gateway-secret")
    monkeypatch.setenv("NEETPG2027_OPENAI_API_KEY", "provider-secret")
    monkeypatch.setenv("NEETPG2027_OPENAI_MODEL", "test-openai-model")

    captured = {}

    def fake_post(url, *, headers, payload, timeout):
        captured.update(url=url, headers=headers, payload=payload, timeout=timeout)
        return {"output_text": "Grounded result [NOTE:mi]"}

    monkeypatch.setattr(provider_module, "_post_json", fake_post)

    with TestClient(create_app()) as client:
        wrong_status = client.get("/ai/providers", headers={"X-NeuralVault-Token": "wrong"})
        ready_status = client.get("/ai/providers", headers={"X-NeuralVault-Token": "gateway-secret"})
        denied = client.post(
            "/ai/generate",
            json={"provider": "openai", "prompt": "hello", "max_output_tokens": 128},
        )
        allowed = client.post(
            "/ai/generate",
            headers={"X-NeuralVault-Token": "gateway-secret"},
            json={"provider": "openai", "prompt": "hello", "max_output_tokens": 128},
        )

    assert wrong_status.status_code == 200
    assert wrong_status.json()["gateway_authorized"] is False
    assert ready_status.json()["gateway_authorized"] is True
    assert denied.status_code == 401
    assert allowed.status_code == 200
    assert allowed.json() == {
        "provider": "openai",
        "model": "test-openai-model",
        "text": "Grounded result [NOTE:mi]",
    }
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["headers"]["Authorization"] == "Bearer provider-secret"
    assert captured["payload"]["input"] == "hello"
    assert "provider-secret" not in allowed.text
    assert "gateway-secret" not in allowed.text


def test_provider_adapters_parse_gemini_anthropic_and_compatible(monkeypatch):
    base = dict(
        database_url="sqlite:///:memory:",
        media_root=Path("instance/media"),
        ai_access_token="gateway",
        gemini_api_key="g-key",
        gemini_model="g-model",
        anthropic_api_key="a-key",
        anthropic_model="a-model",
        compatible_base_url="http://127.0.0.1:1234",
        compatible_api_key="local-key",
        compatible_model="local-model",
    )
    settings = Settings(**base)

    responses = iter(
        [
            {"candidates": [{"content": {"parts": [{"text": "Gemini grounded"}]}}]},
            {"content": [{"type": "text", "text": "Claude grounded"}]},
            {"choices": [{"message": {"content": "Local grounded"}}]},
        ]
    )
    calls = []

    def fake_post(url, *, headers, payload, timeout):
        calls.append((url, headers, payload))
        return next(responses)

    monkeypatch.setattr(provider_module, "_post_json", fake_post)

    assert provider_module.generate_text(
        settings, provider="gemini", prompt="p", max_output_tokens=100
    ) == ("g-model", "Gemini grounded")
    assert provider_module.generate_text(
        settings, provider="anthropic", prompt="p", max_output_tokens=100
    ) == ("a-model", "Claude grounded")
    assert provider_module.generate_text(
        settings, provider="compatible", prompt="p", max_output_tokens=100
    ) == ("local-model", "Local grounded")

    assert calls[0][0].endswith("/models/g-model:generateContent")
    assert calls[0][1]["x-goog-api-key"] == "g-key"
    assert calls[1][0] == "https://api.anthropic.com/v1/messages"
    assert calls[1][1]["anthropic-version"] == "2023-06-01"
    assert calls[2][0] == "http://127.0.0.1:1234/v1/chat/completions"


def test_configured_cors_origin_allows_pages_frontend(monkeypatch, tmp_path):
    _clear_ai_env(monkeypatch)
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'ai.sqlite3'}")
    monkeypatch.setenv("NEETPG2027_CORS_ORIGINS", "https://mdmoazzam291.github.io")

    with TestClient(create_app()) as client:
        response = client.options(
            "/ai/providers",
            headers={
                "Origin": "https://mdmoazzam291.github.io",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "x-neuralvault-token,content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://mdmoazzam291.github.io"
    assert "x-neuralvault-token" in response.headers["access-control-allow-headers"].lower()


def test_ai_gateway_rate_limit_blocks_excess_calls(monkeypatch, tmp_path):
    _clear_ai_env(monkeypatch)
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'rate.sqlite3'}")
    monkeypatch.setenv("NEETPG2027_AI_ACCESS_TOKEN", "rate-limit-token")
    monkeypatch.setenv("NEETPG2027_AI_MAX_REQUESTS_PER_MINUTE", "1")
    monkeypatch.setenv("NEETPG2027_OPENAI_API_KEY", "provider-secret")
    monkeypatch.setenv("NEETPG2027_OPENAI_MODEL", "test-openai-model")

    monkeypatch.setattr(
        provider_module,
        "_post_json",
        lambda *args, **kwargs: {"output_text": "ok"},
    )

    with TestClient(create_app()) as client:
        headers = {"X-NeuralVault-Token": "rate-limit-token"}
        payload = {"provider": "openai", "prompt": "hello", "max_output_tokens": 128}
        first = client.post("/ai/generate", headers=headers, json=payload)
        second = client.post("/ai/generate", headers=headers, json=payload)

    assert first.status_code == 200
    assert second.status_code == 429
    assert "rate limit" in second.json()["detail"].lower()
