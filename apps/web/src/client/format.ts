/** Media time → "m:ss" under an hour, "h:mm:ss" from an hour (e.g. 761000 → "12:41"). */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${minutes}:${ss}`
}

/** Spoken form for screen readers: "12 minutes 41 seconds". */
export function formatTimestampLong(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (seconds || parts.length === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`)
  return parts.join(' ')
}

/** Daily quota metrics (contracts USAGE_METRICS) in the words the student sees (F8.3). */
const QUOTA_LABELS: Readonly<Record<string, string>> = {
  activities: 'practice activities',
  llm_tasks: 'AI requests',
  lectures: 'lecture uploads',
  reprocess: 'map rebuilds',
}

/**
 * Copy for a 429 `quota_exceeded` from its details `{ metric, limit, resetAt }`: the limit in
 * words and when it resets, in the viewer's time zone unless one is given.
 */
export function quotaMessage(
  details: Record<string, unknown> | undefined,
  timeZone?: string,
): string {
  const label = typeof details?.metric === 'string' ? QUOTA_LABELS[details.metric] : undefined
  const limit = typeof details?.limit === 'number' ? `${details.limit} ` : ''
  const head = label ? `You've used today's ${limit}${label}.` : "You've reached today's limit."
  const resetAt = typeof details?.resetAt === 'string' ? new Date(details.resetAt) : null
  if (!resetAt || Number.isNaN(resetAt.getTime())) return `${head} Please try again tomorrow.`
  const time = resetAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
  return `${head} The limit resets at ${time}.`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
