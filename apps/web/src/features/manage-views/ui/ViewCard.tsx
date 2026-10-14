import { motion } from 'framer-motion'
import { useState } from 'react'
import type { View } from '@/entities/view'
import { Button, cn } from '@/shared/ui'

export function ViewCard({
  view,
  isCurrent,
  canRecapture,
  onRename,
  onEditZones,
  onRecapture,
  onDelete,
}: {
  view: View
  isCurrent: boolean
  canRecapture: boolean
  onRename: (name: string) => void
  onEditZones: () => void
  onRecapture: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'overflow-hidden rounded-xl border bg-surface',
        isCurrent ? 'border-free' : 'border-line',
      )}
    >
      <div className="relative aspect-video bg-surface-2">
        {view.referenceUrl && (
          <img
            src={view.referenceUrl}
            alt={`Reference of ${view.name}`}
            className="h-full w-full object-cover"
          />
        )}
        {isCurrent && (
          <span className="absolute left-2 top-2 rounded-full bg-free px-2 py-0.5 text-[11px] font-medium text-white">
            Showing now
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <input
          defaultValue={view.name}
          aria-label={`Rename ${view.name}`}
          onBlur={(e) => {
            const next = e.target.value.trim()
            if (next && next !== view.name) onRename(next)
          }}
          className="rounded-md bg-transparent px-1 text-sm font-medium hover:bg-surface-2 focus:bg-surface-2"
        />
        <p className="px-1 text-xs text-muted">
          {view.zoneCount} zone{view.zoneCount === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" onClick={onEditZones}>
            Edit zones
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={!canRecapture}
            onClick={onRecapture}
            title="Use the current image as this view's reference"
          >
            Re-capture
          </Button>
          {confirming ? (
            <Button size="xs" variant="danger" onClick={onDelete}>
              Delete view + zones?
            </Button>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              className="text-busy hover:text-busy"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </motion.li>
  )
}
