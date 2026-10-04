/**
 * UI feature switches. Spec §3: "Unbuilt features are hidden, not shown as broken buttons."
 * Feature teams flip their flag to `true` when the feature works end to end; entry points
 * (buttons, toggles, links) check these flags.
 */
export const FEATURES = {
  /** React Flow concept-map canvas on /courses/[id]. List view is always on. */
  conceptMapCanvas: true,
  /** "Spot the flaw" practice button in the map's node panel. */
  practiceSpotFlaw: true,
  /** "Teach-back" practice button in the map's node panel. */
  practiceTeachBack: true,
  /** "Transfer problem" button, shown only when the concept has an unseen item (F4b). */
  practiceTransfer: true,
  /** "Stump the AI" (beta) practice button in the map's node panel. */
  stump: true,
  /** "Add lecture" entry points → /lectures/new (TODO(feature-capture-import)). */
  addLecture: true,
  /** Creating personal courses from the dashboard. */
  createCourse: true,
} as const
