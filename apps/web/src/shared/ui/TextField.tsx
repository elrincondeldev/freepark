import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

/** Labelled text input. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, className, ...props },
  ref,
) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <input
        ref={ref}
        className={cn('rounded-lg border border-line bg-surface px-3 py-1.5', className)}
        {...props}
      />
    </label>
  )
})
