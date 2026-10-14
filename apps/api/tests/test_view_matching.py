import cv2
import numpy as np
import pytest

from app.views import ViewMatcher, apply_homography
from tests.fixtures import gray, manifest


@pytest.fixture(scope="module")
def matcher():
    return ViewMatcher()


def same_view_pairs():
    for cam, views in manifest().items():
        for view, names in views.items():
            for other in names[1:]:
                yield pytest.param(names[0], other, id=f"{cam}{view}-{other[3:]}")


def different_view_pairs():
    for cam, views in manifest().items():
        labels = sorted(views)
        for i, a in enumerate(labels):
            for b in labels[i + 1 :]:
                yield pytest.param(views[a][0], views[b][0], id=f"{cam}{a}-{b}")


@pytest.mark.parametrize(("ref", "other"), list(same_view_pairs()))
def test_same_view_matches_despite_traffic_and_timestamp(matcher, ref, other):
    m = matcher.match_pair(matcher.features(gray(ref)), matcher.features(gray(other)))
    assert matcher.accepts(m)
    assert matcher.confidence(m) > 0.3


@pytest.mark.parametrize(("ref", "other"), list(different_view_pairs()))
def test_different_viewpoints_do_not_match(matcher, ref, other):
    m = matcher.match_pair(matcher.features(gray(ref)), matcher.features(gray(other)))
    assert not matcher.accepts(m)


def test_other_camera_does_not_match(matcher):
    m = matcher.match_pair(
        matcher.features(gray("47_1791962972.jpg")), matcher.features(gray("34_1791962940.jpg"))
    )
    assert not matcher.accepts(m)


def test_shift_recovers_translation(matcher):
    ref = gray("47_1791962972.jpg")
    dx, dy = -12, 6  # camera panned: content moves 12px left, 6px down
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    shifted = cv2.warpAffine(ref, M, (ref.shape[1], ref.shape[0]), borderMode=cv2.BORDER_REPLICATE)
    m = matcher.match_pair(matcher.features(ref), matcher.features(shifted))
    assert matcher.accepts(m)
    p = apply_homography(m.homography, np.array([[0.5, 0.6]]))[0]
    assert p[0] == pytest.approx(0.5 + dx / 384, abs=0.004)
    assert p[1] == pytest.approx(0.6 + dy / 216, abs=0.006)


def test_banner_change_alone_matches(matcher):
    ref = gray("34_1791962940.jpg")
    other = ref.copy()
    cv2.putText(
        other, "TV34 Areal 2099-01-01 23:59:59", (2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, 255, 1
    )
    m = matcher.match_pair(matcher.features(ref), matcher.features(other))
    assert matcher.accepts(m) and m.inlier_ratio > 0.9
