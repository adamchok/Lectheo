/**
 * Motion tokens for `motion/react` — the same values as `--duration-*` / `--ease-*` in globals.css
 * (Design System §3 Motion). Durations are in seconds, as Motion expects. `motion.test.ts` keeps the
 * two in step.
 */
export const duration = {
  fast: 0.12,
  base: 0.18,
  slow: 0.26,
  emphasis: 0.4,
} as const

type Bezier = readonly [number, number, number, number]

export const ease = {
  /** Things entering or responding. */
  out: [0.16, 1, 0.3, 1],
  /** Things leaving; exits run at about 70 % of the enter duration. */
  in: [0.4, 0, 1, 1],
  /** Moves between two on-screen states. */
  standard: [0.2, 0, 0, 1],
} as const satisfies Record<string, Bezier>

/** Layout animations. No bounce anywhere. */
export const springLayout = { type: 'spring', bounce: 0, duration: 0.3 } as const
