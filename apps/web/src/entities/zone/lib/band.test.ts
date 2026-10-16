import { bandPolygon, endBands, midpoints } from './band'

test('band polygon surrounds a horizontal line with the given half-width', () => {
  const poly = bandPolygon(
    [
      [0.1, 0.5],
      [0.9, 0.5],
    ],
    0.05,
    0.05,
  )
  expect(poly).toHaveLength(4)
  const ys = poly.map((p) => p[1])
  const half = (0.05 * 384) / 216
  expect(Math.max(...ys)).toBeCloseTo(0.5 + half)
  expect(Math.min(...ys)).toBeCloseTo(0.5 - half)
})

test('band narrows towards the far end', () => {
  const poly = bandPolygon(
    [
      [0.5, 0.9],
      [0.5, 0.1],
    ],
    0.04,
    0.01,
  )
  const widthAt = (i: number, j: number) => Math.abs(poly[i][0] - poly[j][0])
  expect(widthAt(0, 3)).toBeCloseTo(0.08)
  expect(widthAt(1, 2)).toBeCloseTo(0.02)
})

test('needs two points; midpoints between consecutive points', () => {
  expect(bandPolygon([[0.1, 0.1]], 0.02, 0.02)).toEqual([])
  expect(
    midpoints([
      [0, 0],
      [1, 1],
      [1, 0],
    ]),
  ).toEqual([
    [0.5, 0.5],
    [1, 0.5],
  ])
})

test('the wide end of the band is always the one nearer the camera', () => {
  // drawn bottom → top (near → far) and top → bottom (far → near): same band shape
  expect(
    endBands(
      [
        [0.5, 0.9],
        [0.5, 0.1],
      ],
      0.04,
      0.01,
    ),
  ).toEqual([0.04, 0.01])
  expect(
    endBands(
      [
        [0.5, 0.1],
        [0.5, 0.9],
      ],
      0.04,
      0.01,
    ),
  ).toEqual([0.01, 0.04])
  const down = bandPolygon(
    [
      [0.5, 0.1],
      [0.5, 0.9],
    ],
    0.04,
    0.01,
  )
  expect(Math.abs(down[1][0] - down[2][0])).toBeCloseTo(0.08) // wide at the bottom point
})
