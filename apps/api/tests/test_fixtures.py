import cv2

from tests.fixtures import FRAMES, manifest


def test_fixture_frames_are_384x216_jpegs():
    files = sorted(FRAMES.glob("*.jpg"))
    assert len(files) >= 25
    for f in files:
        data = f.read_bytes()
        assert data[:2] == b"\xff\xd8", f.name
        img = cv2.imread(str(f))
        assert img.shape == (216, 384, 3), f.name


def test_manifest_lists_every_frame_once():
    listed = [n for views in manifest().values() for names in views.values() for n in names]
    assert len(listed) == len(set(listed))
    assert set(listed) == {f.name for f in FRAMES.glob("*.jpg")}
    assert all(len(views) >= 2 for views in manifest().values())  # viewpoint changes captured
