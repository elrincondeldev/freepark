import { AnimatePresence, motion } from 'framer-motion'
import { EASE_OUT } from '@/shared/ui'

/**
 * A city street seen from a traffic camera on a mast, drawn with a simple pinhole projection
 * so cars, bays and buildings keep believable proportions. World units are metres:
 * x across the street (0 = centre line), y up, z away from the camera.
 */

export type Phase = 'occupied' | 'leaving' | 'free'

const W = 640
const HORIZON = 118
const FOCAL = 300
const CAMERA_HEIGHT = 6

type Vec = [x: number, y: number, z: number]

function project([x, y, z]: Vec): [number, number] {
  return [W / 2 + (FOCAL * x) / z, HORIZON + (FOCAL * (CAMERA_HEIGHT - y)) / z]
}
const pts = (points: Vec[]) =>
  points
    .map(project)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

// Street cross-section (metres from the centre line).
const LANE = 3.4 // driving lane edge
const CURB = 5.6 // parking lane outer edge
const FACADE = 8.6
const NEAR = 6.5
const FAR = 140

const CAR = { width: 1.8, length: 4.3, height: 1.45 }

interface Car {
  x: number
  z: number
  body: string
}

const RIGHT_CARS: Car[] = [
  { x: 4.5, z: 8.4, body: '#3d4654' }, // the one that leaves
  { x: 4.5, z: 13.9, body: '#d6dbe2' },
  { x: 4.5, z: 19.6, body: '#9aa5b4' },
  { x: 4.5, z: 25.2, body: '#e9edf2' },
  { x: 4.5, z: 31, body: '#56606f' },
  { x: 4.5, z: 37, body: '#c3cad4' },
]
const LEFT_CARS: Car[] = [
  { x: -4.5, z: 10, body: '#77818f' },
  { x: -4.5, z: 15.7, body: '#e2e6ec' },
  { x: -4.5, z: 27, body: '#4a5361' },
  { x: -4.5, z: 33, body: '#b4bcc7' },
]
const LEAVING = RIGHT_CARS[0]
const FREE_BAY = { z0: LEAVING.z - 0.6, z1: LEAVING.z + CAR.length + 0.6 }

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))))
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`
}

/** Where the leaving car is at progress p (0 parked → 1 gone down the street). */
function leavingPose(p: number): { x: number; z: number; opacity: number } {
  const pull = Math.min(1, p / 0.38)
  const easedPull = pull * pull * (3 - 2 * pull)
  const drive = Math.max(0, (p - 0.2) / 0.8)
  return {
    x: LEAVING.x + (1.7 - LEAVING.x) * easedPull,
    z: LEAVING.z + 1.6 * easedPull + 90 * drive * drive,
    opacity: p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25,
  }
}

function carFaces({ x, z, body }: Car) {
  const half = CAR.width / 2
  const back = z
  const front = z + CAR.length
  const top = CAR.height
  const towardCentre = x > 0 ? x - half : x + half
  return {
    shadow: pts([
      [x - half - 0.15, 0, back - 0.2],
      [x + half + 0.15, 0, back - 0.2],
      [x + half + 0.15, 0, front + 0.2],
      [x - half - 0.15, 0, front + 0.2],
    ]),
    side: pts([
      [towardCentre, 0.3, back],
      [towardCentre, 0.3, front],
      [towardCentre, top * 0.92, front - 0.5],
      [towardCentre, top * 0.92, back + 0.5],
    ]),
    roof: pts([
      [x - half * 0.86, top, back + 0.9],
      [x + half * 0.86, top, back + 0.9],
      [x + half * 0.86, top, front - 1.1],
      [x - half * 0.86, top, front - 1.1],
    ]),
    hood: pts([
      [x - half, top * 0.72, back],
      [x + half, top * 0.72, back],
      [x + half * 0.86, top, back + 0.9],
      [x - half * 0.86, top, back + 0.9],
    ]),
    rear: pts([
      [x - half, 0.3, back],
      [x + half, 0.3, back],
      [x + half, top * 0.72, back],
      [x - half, top * 0.72, back],
    ]),
    lights: [
      [x - half + 0.12, x - half + 0.45],
      [x + half - 0.45, x + half - 0.12],
    ].map(([a, b]) =>
      pts([
        [a, 0.72, back],
        [b, 0.72, back],
        [b, 0.88, back],
        [a, 0.88, back],
      ]),
    ),
    colors: {
      body,
      side: shade(body, -0.22),
      roof: shade(body, 0.12),
      glass: '#0d1420',
    },
  }
}

/** Screen-space bounding box of a car, padded: the detection box drawn over it. */
function carBox({ x, z }: Car): { x: number; y: number; width: number; height: number } {
  const half = CAR.width / 2
  const corners: Vec[] = []
  for (const dx of [-half, half])
    for (const y of [0, CAR.height])
      for (const dz of [0, CAR.length]) corners.push([x + dx, y, z + dz])
  const projected = corners.map(project)
  const xs = projected.map((p) => p[0])
  const ys = projected.map((p) => p[1])
  const pad = 2
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  }
}

function CarShape({ car, opacity = 1 }: { car: Car; opacity?: number }) {
  const f = carFaces(car)
  return (
    <g opacity={opacity}>
      <polygon points={f.shadow} fill="#000" opacity={0.35} />
      <polygon points={f.side} fill={f.colors.side} />
      <polygon points={f.rear} fill={f.colors.body} />
      <polygon points={f.hood} fill={f.colors.glass} opacity={0.85} />
      <polygon points={f.roof} fill={f.colors.roof} />
      {f.lights.map((light, i) => (
        <polygon key={i} points={light} fill="#f87171" />
      ))}
    </g>
  )
}

// Deterministic "random" so windows don't flicker between renders.
const lit = (i: number) => ((i * 9301 + 49297) % 233280) / 233280 < 0.38

const BUILDINGS = [
  { z0: 7, z1: 19, height: 16 },
  { z0: 19, z1: 31, height: 22 },
  { z0: 31, z1: 46, height: 13 },
  { z0: 46, z1: 64, height: 19 },
  { z0: 64, z1: 140, height: 15 },
]

function Facade({ side }: { side: 1 | -1 }) {
  const x = FACADE * side
  let index = side === 1 ? 0 : 500
  return (
    <g>
      {BUILDINGS.map((b, i) => {
        const height = side === 1 ? b.height : BUILDINGS[(i + 2) % BUILDINGS.length].height
        const windows = []
        for (let floor = 3; floor + 1.6 < height; floor += 3) {
          for (let wz = b.z0 + 1.2; wz + 1.1 < b.z1; wz += 2.8) {
            index += 1
            windows.push(
              <polygon
                key={`${floor}-${wz}`}
                points={pts([
                  [x, floor, wz],
                  [x, floor, wz + 1.1],
                  [x, floor + 1.3, wz + 1.1],
                  [x, floor + 1.3, wz],
                ])}
                fill={lit(index) ? '#fcd34d' : '#0b1018'}
                opacity={lit(index) ? 0.42 : 0.4}
              />,
            )
          }
        }
        return (
          <g key={b.z0}>
            <polygon
              points={pts([
                [x, 0, b.z0],
                [x, 0, b.z1],
                [x, height, b.z1],
                [x, height, b.z0],
              ])}
              fill={i % 2 ? '#2b3442' : '#323c4b'}
            />
            {windows}
          </g>
        )
      })}
    </g>
  )
}

export function StreetScene({ phase, progress }: { phase: Phase; progress: number }) {
  const pose = leavingPose(progress)
  const leavingCar = { ...LEAVING, x: pose.x, z: pose.z }
  const parked = [...RIGHT_CARS.filter((c) => c !== LEAVING), ...LEFT_CARS]
  const showLeaving = phase !== 'free' && pose.opacity > 0
  const drawn = [...parked, ...(showLeaving ? [leavingCar] : [])].sort((a, b) => b.z - a.z)

  const bays: number[] = []
  for (let z = 7.8; z < 46; z += 5.6) bays.push(z)

  return (
    <svg viewBox={`0 0 ${W} 360`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="pv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2536" />
          <stop offset="1" stopColor="#46536b" />
        </linearGradient>
        <linearGradient id="pv-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4250" />
          <stop offset="1" stopColor="#262c35" />
        </linearGradient>
        <linearGradient id="pv-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#46536b" stopOpacity="0" />
          <stop offset="0.55" stopColor="#46536b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#46536b" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width={W} height={HORIZON + 6} fill="url(#pv-sky)" />
      <Facade side={1} />
      <Facade side={-1} />

      {/* sidewalks, road and markings */}
      <polygon
        points={pts([
          [CURB, 0, NEAR],
          [FACADE, 0, NEAR],
          [FACADE, 0, FAR],
          [CURB, 0, FAR],
        ])}
        fill="#59616d"
      />
      <polygon
        points={pts([
          [-FACADE, 0, NEAR],
          [-CURB, 0, NEAR],
          [-CURB, 0, FAR],
          [-FACADE, 0, FAR],
        ])}
        fill="#59616d"
      />
      <polygon
        points={pts([
          [-CURB, 0, NEAR],
          [CURB, 0, NEAR],
          [CURB, 0, FAR],
          [-CURB, 0, FAR],
        ])}
        fill="url(#pv-road)"
      />
      {[CURB, -CURB].map((x) => (
        <polygon
          key={x}
          points={pts([
            [x, 0, NEAR],
            [x + Math.sign(x) * 0.2, 0, NEAR],
            [x + Math.sign(x) * 0.2, 0, FAR],
            [x, 0, FAR],
          ])}
          fill="#8a929d"
        />
      ))}
      {[LANE, -LANE].map((x) => (
        <polygon
          key={x}
          points={pts([
            [x - 0.06, 0, NEAR],
            [x + 0.06, 0, NEAR],
            [x + 0.06, 0, FAR],
            [x - 0.06, 0, FAR],
          ])}
          fill="#e5e7eb"
          opacity={0.55}
        />
      ))}
      {bays.flatMap((z) =>
        [1, -1].map((s) => (
          <polygon
            key={`${s}-${z}`}
            points={pts([
              [s * LANE, 0, z],
              [s * CURB, 0, z],
              [s * CURB, 0, z + 0.12],
              [s * LANE, 0, z + 0.12],
            ])}
            fill="#e5e7eb"
            opacity={0.45}
          />
        )),
      )}
      {Array.from({ length: 14 }, (_, i) => 7 + i * 6).map((z) => (
        <polygon
          key={z}
          points={pts([
            [-0.08, 0, z],
            [0.08, 0, z],
            [0.08, 0, z + 3],
            [-0.08, 0, z + 3],
          ])}
          fill="#f8fafc"
          opacity={0.7}
        />
      ))}
      <rect y={HORIZON - 12} width={W} height={34} fill="url(#pv-haze)" />

      {/* the freed bay */}
      <AnimatePresence>
        {phase === 'free' && (
          <motion.polygon
            key="free"
            points={pts([
              [LANE + 0.1, 0, FREE_BAY.z0],
              [CURB - 0.05, 0, FREE_BAY.z0],
              [CURB - 0.05, 0, FREE_BAY.z1],
              [LANE + 0.1, 0, FREE_BAY.z1],
            ])}
            className="fill-free/40 stroke-free"
            strokeWidth={2}
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.7, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3, ease: EASE_OUT }}
          />
        )}
      </AnimatePresence>

      {/* cars, far to near */}
      {drawn.map((car) => (
        <CarShape
          key={car === leavingCar ? 'leaving' : `${car.x}-${car.z}`}
          car={car}
          opacity={car === leavingCar ? pose.opacity : 1}
        />
      ))}

      {/* detections: red where a parked car occupies the curb */}
      {[...RIGHT_CARS, ...LEFT_CARS].map((car) => {
        const box = carBox(car)
        const isLeaving = car === LEAVING
        return (
          <motion.rect
            key={`box-${car.x}-${car.z}`}
            {...box}
            rx={3}
            className="fill-busy/10 stroke-busy"
            strokeWidth={1.5}
            initial={false}
            animate={{ opacity: isLeaving && phase !== 'occupied' ? 0 : 0.95 }}
            transition={{ duration: 0.35 }}
          />
        )
      })}
    </svg>
  )
}
