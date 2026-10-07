import type { LectureMediaJson } from '@lectheo/contracts'

export interface LectureLengthInput {
  media: LectureMediaJson | null
  durationMs: number | null
}

export interface PlayableWindow {
  /** Where the lecture starts in media time: a library window's start, else 0. */
  startMs: number
  durationMs: number | null
}

/**
 * What the student actually watches, in media time (one rule for the map, next step and Study):
 * library lectures play only their window (`media.startMs..endMs`, e.g. 45 min of a 2 h video);
 * otherwise the media file or YouTube length, else `lectures.duration_ms`, else the last
 * segment's end.
 */
export function playableWindow(
  lecture: LectureLengthInput,
  lastSegmentEndMs: number | null = null,
): PlayableWindow {
  const start = lecture.media?.startMs
  const end = lecture.media?.endMs
  if (typeof start === 'number' && typeof end === 'number' && end > start) {
    return { startMs: start, durationMs: end - start }
  }
  const durationMs = lecture.media?.durationMs ?? lecture.durationMs ?? lastSegmentEndMs
  return { startMs: 0, durationMs }
}
