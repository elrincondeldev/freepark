import { useId } from 'react'

/**
 * The FreePark mark: a "P" whose bowl holds a camera lens, on a green tile.
 * Same artwork as public/logo.svg and the favicons.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-tile)`} />
      <rect width="64" height="64" rx="16" fill={`url(#${id}-shine)`} />
      <path
        d="M21 49V15h12.5a12 12 0 0 1 0 24H21"
        fill="none"
        stroke="#fff"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33" cy="27" r="3.6" fill="#fff" />
    </svg>
  )
}

/** The product name, with "Free" in the brand green. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `whitespace-nowrap ${className}` : 'whitespace-nowrap'}>
      <span className="text-free">Free</span>Park
    </span>
  )
}
