/** A timestamp as it arrives from the DB driver (Date), JSON (ISO string) or code (epoch ms). */
export type Timestamp = Date | string | number

/** Epoch milliseconds for a `Timestamp`. Invalid input becomes `NaN`. */
export function toEpochMs(value: Timestamp): number {
  if (typeof value === 'number') return value
  return value instanceof Date ? value.getTime() : Date.parse(value)
}
