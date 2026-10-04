/*
 * Import mode (F1.5, Architecture §4.2 B): the picked video/audio file stays on this device.
 * The File is kept in memory, keyed by lecture id, as an object URL for <video src>. A reload
 * empties the registry; the player then asks the student to pick the same file again.
 */

export interface LocalMedia {
  file: File
  url: string
}

const registry = new Map<string, LocalMedia>()

/** Registers (or replaces) the local file for a lecture and returns its object URL. */
export function registerLocalMedia(lectureId: string, file: File): string {
  releaseLocalMedia(lectureId)
  const url = URL.createObjectURL(file)
  registry.set(lectureId, { file, url })
  return url
}

export function getLocalMedia(lectureId: string): LocalMedia | undefined {
  return registry.get(lectureId)
}

export function releaseLocalMedia(lectureId: string): void {
  const entry = registry.get(lectureId)
  if (!entry) return
  URL.revokeObjectURL(entry.url)
  registry.delete(lectureId)
}

/** Above this gap the file is probably a different cut than the transcript. */
export const DURATION_TOLERANCE_MS = 2_000

/** True when a re-picked file looks like the one imported (same name; same length if known). */
export function matchesImportedMedia(
  picked: { name: string; durationMs?: number | null },
  media: { localFileName?: string | null; durationMs?: number | null },
): boolean {
  if (media.localFileName && picked.name !== media.localFileName) return false
  if (picked.durationMs == null || media.durationMs == null) return true
  return Math.abs(picked.durationMs - media.durationMs) <= DURATION_TOLERANCE_MS
}
