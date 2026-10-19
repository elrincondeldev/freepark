import { motion } from 'framer-motion'
import { GITHUB_URL } from '@/shared/config'
import { cn } from '@/shared/ui'
import { formatStars, useGitHubStars } from '../api/github'
import { GitHubIcon, StarFilledIcon } from './icons'

/** "Star on GitHub" with the live star count, linking to the repository. */
export function GitHubStarButton({
  size = 'md',
  label = 'Star on GitHub',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}) {
  const stars = useGitHubStars()
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={stars === null ? `${label}` : `${label} (${stars} stars)`}
      className={cn(
        'group inline-flex shrink-0 items-center overflow-hidden rounded-full border border-line bg-surface font-medium text-ink shadow-sm transition hover:border-ink/30 hover:shadow-md',
        size === 'sm' && 'h-9 text-sm',
        size === 'md' && 'h-11 text-sm',
        size === 'lg' && 'h-14 text-base',
        className,
      )}
    >
      <span className={cn('flex items-center gap-2', size === 'lg' ? 'px-6' : 'px-4')}>
        <GitHubIcon width={size === 'lg' ? 20 : 17} height={size === 'lg' ? 20 : 17} />
        {label}
      </span>
      {stars !== null && (
        <motion.span
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          className="flex h-full items-center gap-1.5 border-l border-line bg-surface-2/60 px-3.5 tabular-nums"
        >
          <StarFilledIcon
            width={14}
            height={14}
            className="text-warn transition-transform duration-300 group-hover:rotate-[72deg] group-hover:scale-110"
          />
          {formatStars(stars)}
        </motion.span>
      )}
    </a>
  )
}
