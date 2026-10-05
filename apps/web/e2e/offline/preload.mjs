/*
 * E2E_OFFLINE=1 only (sandboxes without Cloudflare access): loaded into the e2e web server via
 * NODE_OPTIONS=--import. Answers Turnstile siteverify locally the way Cloudflare's always-pass test
 * secret does, so the sample sign-in works offline. Every other request goes to the real fetch.
 */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const realFetch = globalThis.fetch

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url === SITEVERIFY) return Promise.resolve(Response.json({ success: true }))
  return realFetch(input, init)
}
