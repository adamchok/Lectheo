import type { ActivityType } from '@lectheo/contracts'
import { notFound } from '../errors'
import { FEATURES } from '../features'
import { spotFlawHandler } from './spot-flaw'
import { teachBackHandler } from './teach-back'
import type { ActivityTypeHandler } from './types'

/*
 * One handler module per practice type. To add a type: write `<type>.ts` exporting an
 * ActivityTypeHandler<'<type>'>, register it here (behind its FEATURES flag if optional).
 * A missing or disabled type is a hidden feature → 404.
 */
export const ACTIVITY_HANDLERS: {
  readonly [T in ActivityType]: ActivityTypeHandler<T> | undefined
} = {
  spot_flaw: spotFlawHandler,
  teach_back: teachBackHandler,
  // TODO(feature-transfer): transfer.ts handler, enabled by FEATURES.transfer.
  transfer: undefined,
  // TODO(feature-stump): stump.ts handler, enabled by FEATURES.stump.
  stump: undefined,
}

const OPTIONAL: Partial<Record<ActivityType, boolean>> = FEATURES

export function isEnabled(type: ActivityType): boolean {
  return ACTIVITY_HANDLERS[type] !== undefined && OPTIONAL[type] !== false
}

/** The handler for `type`, or 404 not_found when it is unknown or disabled. */
export function handlerFor(type: ActivityType): ActivityTypeHandler {
  const handler = ACTIVITY_HANDLERS[type] as ActivityTypeHandler | undefined
  if (!handler || !isEnabled(type)) throw notFound()
  return handler
}
