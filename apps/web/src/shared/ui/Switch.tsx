import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { motionPresets } from './motion'

export interface SwitchProps {
  checked: boolean
  onChange: () => void
  label: string
  icon?: ReactNode
}

export function Switch({ checked, onChange, label, icon }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex items-center gap-3 rounded-lg px-1 py-1 text-left text-sm hover:bg-surface-2"
    >
      <span
        className={cn('relative h-5 w-9 rounded-full transition', checked ? 'bg-free' : 'bg-line')}
      >
        <motion.span
          layout
          transition={motionPresets.fast}
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow',
            checked ? 'right-0.5' : 'left-0.5',
          )}
        />
      </span>
      {icon && <span className="text-muted">{icon}</span>}
      {label}
    </button>
  )
}
