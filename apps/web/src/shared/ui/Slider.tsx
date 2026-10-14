export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
}

export function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs text-muted">
        {label}
        <span className="tabular-nums">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--accent)]"
      />
    </label>
  )
}
