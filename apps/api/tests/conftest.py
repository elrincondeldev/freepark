import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

SOURCE = "https://cams.test/cam.php?id={id}"


@pytest.fixture
def settings(tmp_path):
    return Settings(
        _env_file=None,
        data_dir=tmp_path,
        source_url_template=SOURCE,
        detector="fake",
        poll_interval_seconds=0.02,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
