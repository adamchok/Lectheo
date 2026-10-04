/**
 * UI feature switches. Spec §3: "Unbuilt features are hidden, not shown as broken buttons."
 * Feature teams flip their flag to `true` when the feature works end to end; entry points
 * (buttons, toggles, links) check these flags.
 */
export const FEATURES = {
  /** React Flow concept-map canvas on /courses/[id] (TODO(feature-concept-map)). List view is always on. */
  conceptMapCanvas: false,
  /** "Add lecture" entry points → /lectures/new (TODO(feature-capture-import)). */
  addLecture: false,
  /** Creating personal courses from the dashboard. */
  createCourse: false,
} as const
