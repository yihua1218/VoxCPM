import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from taigi_web import server


class DummyResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_rule_translator_stays_available():
    assert server.translate_chinese_to_taigi("我們可以再試一次。") == "咱會使閣試一次。"


def test_tw_hokkien_llm_translation_uses_completions_api(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout):
        captured["url"] = req.full_url
        captured["timeout"] = timeout
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return DummyResponse({"choices": [{"text": "咱會使閣試一擺。[/TRANS]"}]})

    monkeypatch.setattr(server.urllib.request, "urlopen", fake_urlopen)
    settings = server.AppSettings(
        translator_backend="tw_hokkien_llm",
        translator_api_base_url="http://127.0.0.1:8080/v1/",
        translator_model="Bohanlu/Taigi-Llama-2-Translator-7B",
        translator_target_language="HAN",
        translator_timeout_seconds=12,
    )

    translated = server.translate_chinese_to_taigi("我們可以再試一次。", use_model=True, settings=settings)

    assert translated == "咱會使閣試一擺。"
    assert captured["url"] == "http://127.0.0.1:8080/v1/completions"
    assert captured["timeout"] == 12
    assert captured["body"]["prompt"] == "[TRANS]\n我們可以再試一次。\n[/TRANS]\n[HAN]\n"


def test_tw_hokkien_llm_falls_back_to_rule_translator():
    settings = server.AppSettings(
        translator_backend="tw_hokkien_llm",
        translator_api_base_url="",
        translator_model="",
    )

    assert server.translate_chinese_to_taigi("我們可以再試一次。", use_model=True, settings=settings) == "咱會使閣試一次。"


def test_json_state_syncs_file_to_db_and_restores_file(tmp_path, monkeypatch):
    db_path = tmp_path / "taigi.sqlite3"
    state_path = tmp_path / "job" / "output" / "segments.json"
    state_path.parent.mkdir(parents=True)
    state_path.write_text(json.dumps({"segments": [{"index": 1, "taigi_text": "逐家好"}]}, ensure_ascii=False), encoding="utf-8")

    monkeypatch.setattr(server, "SQLITE_DB", db_path)

    loaded = server.load_json_state(state_path, {"segments": []}, key="test_segments")
    state_path.unlink()
    restored = server.load_json_state(state_path, {"segments": []}, key="test_segments")

    assert loaded == {"segments": [{"index": 1, "taigi_text": "逐家好"}]}
    assert restored == loaded
    assert json.loads(state_path.read_text(encoding="utf-8")) == loaded
