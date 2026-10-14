import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'warning'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:opacity-90',
  secondary: 'border border-line hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  success: 'bg-free text-white hover:opacity-90',
  danger: 'bg-busy text-white hover:opacity-90',
  warning: 'bg-warn text-black hover:opacity-90',
}

const SIZES: Record<Size, string> = {
  xs: 'px-3 py-1 text-xs',
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center cursor-pointer justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
})
