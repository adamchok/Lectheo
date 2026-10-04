/** Minimal typing for the Cloudflare Turnstile global (explicit rendering). */
export interface TurnstileRenderOptions {
  sitekey: string
  action?: string
  execution?: 'render' | 'execute'
  appearance?: 'always' | 'execute' | 'interaction-only'
  size?: 'normal' | 'compact' | 'flexible'
  theme?: 'auto' | 'light' | 'dark'
  callback?: (token: string) => void
  'error-callback'?: (code?: string) => void
  'expired-callback'?: () => void
  'timeout-callback'?: () => void
}

export interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string | undefined
  execute: (container: HTMLElement | string, options?: Partial<TurnstileRenderOptions>) => void
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
