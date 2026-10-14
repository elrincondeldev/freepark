"""Polyline geometry for curb parking zones (design D7).

All functions work in *pixel* coordinates of the frame so distances are
isotropic; callers convert from/to normalised coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Projection:
    s: float  # arc length of the closest point
    distance: float  # distance from the point to the line


class Polyline:
    def __init__(self, points: np.ndarray, band_near: float, band_far: float) -> None:
        pts = np.asarray(points, np.float64).reshape(-1, 2)
        if len(pts) < 2:
            raise ValueError("a polyline needs at least two points")
        self.points = pts
        seg = np.diff(pts, axis=0)
        self.seg_len = np.hypot(seg[:, 0], seg[:, 1])
        self.cum = np.concatenate([[0.0], np.cumsum(self.seg_len)])
        self.length = float(self.cum[-1])
        self.band_near = band_near
        self.band_far = band_far

    def band(self, s: float) -> float:
        t = 0.0 if self.length == 0 else min(max(s / self.length, 0.0), 1.0)
        return self.band_near + (self.band_far - self.band_near) * t

    def project(self, p: np.ndarray) -> Projection:
        best = Projection(0.0, float("inf"))
        for i, length in enumerate(self.seg_len):
            a = self.points[i]
            if length == 0:
                continue
            d = (self.points[i + 1] - a) / length
            t = float(np.clip(np.dot(p - a, d), 0.0, length))
            dist = float(np.hypot(*(p - (a + d * t))))
            if dist < best.distance:
                best = Projection(float(self.cum[i] + t), dist)
        return best

    def _segment(self, s: float) -> int:
        return int(min(np.searchsorted(self.cum, s, side="right") - 1, len(self.seg_len) - 1))

    def point_at(self, s: float) -> np.ndarray:
        s = min(max(s, 0.0), self.length)
        i = self._segment(s)
        length = self.seg_len[i]
        if length == 0:
            return self.points[i].copy()
        return self.points[i] + (self.points[i + 1] - self.points[i]) * ((s - self.cum[i]) / length)

    def normal_at(self, s: float) -> np.ndarray:
        i = self._segment(min(max(s, 0.0), self.length))
        d = self.points[i + 1] - self.points[i]
        n = np.array([-d[1], d[0]])
        norm = np.hypot(*n)
        return n / norm if norm else np.array([0.0, 0.0])

    def band_polygon(self, s0: float, s1: float) -> np.ndarray:
        """Polygon covering the band between arc lengths s0 and s1."""
        inner = [s for s in self.cum[1:-1] if s0 < s < s1]
        samples = [s0, *inner, s1]
        left = [self.point_at(s) + self.normal_at(s) * self.band(s) for s in samples]
        right = [self.point_at(s) - self.normal_at(s) * self.band(s) for s in samples]
        return np.array(left + right[::-1])


def merge_intervals(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    merged: list[tuple[float, float]] = []
    for a, b in sorted(intervals):
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def complement(intervals: list[tuple[float, float]], total: float) -> list[tuple[float, float]]:
    gaps, cursor = [], 0.0
    for a, b in merge_intervals(intervals):
        a, b = max(a, 0.0), min(b, total)
        if a > cursor:
            gaps.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < total:
        gaps.append((cursor, total))
    return gaps
