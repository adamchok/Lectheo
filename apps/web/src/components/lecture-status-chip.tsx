import type { LectureStatus } from '@lectheo/contracts'
import {
  Check,
  CircleX,
  FilePen,
  LoaderCircle,
  Network,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_META: Readonly<
  Record<LectureStatus, { label: string; icon: LucideIcon; className: string; spin?: boolean }>
> = {
  draft: { label: 'Draft', icon: FilePen, className: 'bg-muted text-muted-foreground' },
  uploading: { label: 'Uploading', icon: Upload, className: 'bg-accent text-accent-foreground' },
  processing: {
    label: 'Processing',
    icon: LoaderCircle,
    className: 'bg-accent text-accent-foreground',
    spin: true,
  },
  map_ready: {
    label: 'Map ready',
    icon: Network,
    className: 'bg-accent text-accent-foreground',
  },
  ready: { label: 'Ready', icon: Check, className: 'bg-mastery-green-bg text-mastery-green' },
  failed: { label: 'Failed', icon: CircleX, className: 'bg-mastery-red-bg text-mastery-red' },
}

export function lectureStatusLabel(status: LectureStatus): string {
  return STATUS_META[status].label
}

export function LectureStatusChip({
  status,
  label,
  className,
}: {
  status: LectureStatus
  /** Override the default label (e.g. "Ready to watch"). */
  label?: string
  className?: string
}) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-3.5', meta.spin && 'motion-safe:animate-spin')} />
      {label ?? meta.label}
    </span>
  )
}
