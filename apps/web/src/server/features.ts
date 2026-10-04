import type { EnabledActivities } from '@lectheo/domain'

/**
 * Feature flags for optional practice types (Architecture §6.3: transfer and stump only when
 * enabled). Flip to true once their activity flows ship.
 */
export const FEATURES: Required<EnabledActivities> = { transfer: false, stump: false }
