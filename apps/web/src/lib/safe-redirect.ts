/** Accept only same-origin absolute paths from the API to avoid open redirects. */
export function safeRedirect(path: string | undefined, fallback = '/dashboard'): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return fallback
  }
  return path
}
