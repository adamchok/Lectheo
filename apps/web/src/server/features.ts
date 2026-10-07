import type { EnabledActivities } from '@lectheo/domain'
import { serverEnv } from './env'

/**
 * Feature flags for optional practice types (Architecture §6.3: transfer and stump only when
 * enabled). Flip to true once their activity flows ship.
 */
export const FEATURES: Required<EnabledActivities> = { transfer: true, stump: true }

/**
 * YouTube lectures (F10): on only when switched on (`FEATURE_YOUTUBE_LECTURES=1`) and both keys
 * are set, so a missing key never takes a student's quota for a lecture that can't be
 * transcribed. AI_FAKE runs (tests, e2e) use the fake Data API and transcriber instead of keys.
 * Off → the tab is hidden and the endpoints answer 404, like the unbuilt `live` source.
 */
export function youtubeLecturesEnabled(): boolean {
  const env = serverEnv()
  if (!env.FEATURE_YOUTUBE_LECTURES) return false
  return env.AI_FAKE || Boolean(env.YOUTUBE_API_KEY && env.GOOGLE_GENERATIVE_AI_API_KEY)
}
