/** A timestamp as it arrives from the DB driver (Date), JSON (ISO string) or code (epoch ms). */
export type Timestamp = Date | string | number

/** Epoch milliseconds for a `Timestamp`. Invalid input becomes `NaN`. */
export function toEpochMs(value: Timestamp): number {
  if (typeof value === 'number') return value
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

/** Media time → "m:ss" under an hour, "h:mm:ss" from an hour (e.g. 761000 → "12:41"). */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const ss = String(totalSeconds % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${minutes}:${ss}`
}
