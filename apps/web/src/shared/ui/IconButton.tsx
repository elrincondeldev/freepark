import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — icon buttons have no visible text. */
  label: string
  active?: boolean
  size?: 'sm' | 'md'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active = false, size = 'sm', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={props.title ?? label}
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        active ? 'bg-free/15 text-free' : 'text-muted hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...props}
    />
  )
})
