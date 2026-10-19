
from app.config import Settings


def test_defaults(monkeypatch):
    for var in ("POLL_INTERVAL_SECONDS", "VIEW_MASK", "DETECTOR"):
        monkeypatch.delenv(var, raising=False)
    s = Settings(_env_file=None)
    assert s.api_port == 4000
    assert s.poll_interval_seconds == 5.0
    assert s.available_confirm_frames == 2
    assert s.frame_retention == 20
    assert s.view_mask == (0.0, 0.0, 1.0, 0.09)
    assert s.detector == "replicate"


def test_env_overrides(monkeypatch, tmp_path):
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", "2.5")
    monkeypatch.setenv("VIEW_MASK", "0,0,0.5,0.1")
    monkeypatch.setenv("DETECTOR", "fake")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    s = Settings(_env_file=None)
    assert s.poll_interval_seconds == 2.5
    assert s.view_mask == (0.0, 0.0, 0.5, 0.1)
    assert s.detector == "fake"


def test_blank_values_fall_back_to_defaults(monkeypatch):
    monkeypatch.setenv("REPLICATE_INPUT_TEMPLATE", "")
    monkeypatch.setenv("REPLICATE_MODEL", "")
    s = Settings(_env_file=None)
    assert '"query": "car"' in s.replicate_input_template
    assert s.replicate_model.startswith("adirik/grounding-dino:")
