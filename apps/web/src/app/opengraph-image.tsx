import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/site'

export const alt = 'Lectheo · Find what you missed. Prove what you know.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** A hung Google Fonts request must not stall the build. */
const FONT_TIMEOUT_MS = 5_000
const TEXT = 'LectheoFind what you missed.Prove what you know.'

/**
 * Newsreader (the display face) from Google Fonts, subset to the glyphs drawn here. Rendered at
 * build time; without the network (or after 5 s) the image falls back to next/og's default sans.
 */
async function newsreader(weight: number, italic: boolean): Promise<ArrayBuffer | null> {
  const family = `Newsreader:ital,wght@${italic ? 1 : 0},${weight}`
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(TEXT)}`
  try {
    const css = await (await fetch(url, { signal: AbortSignal.timeout(FONT_TIMEOUT_MS) })).text()
    const src = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1]
    return src
      ? await (await fetch(src, { signal: AbortSignal.timeout(FONT_TIMEOUT_MS) })).arrayBuffer()
      : null
  } catch {
    return null
  }
}

/** The lens mark (components/wordmark.tsx), drawn inline: next/og can't render components. */
function Mark({ size: px }: { size: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.25" stroke={BRAND.primary} strokeWidth="2" />
      <circle cx="14.25" cy="9.75" r="3.25" fill={BRAND.primary} />
    </svg>
  )
}

export default async function OpengraphImage(): Promise<ImageResponse> {
  const [medium, semibold, italic] = await Promise.all([
    newsreader(500, false),
    newsreader(600, false),
    newsreader(500, true),
  ])
  const fonts = [
    medium && { name: 'Newsreader', data: medium, weight: 500 as const, style: 'normal' as const },
    semibold && {
      name: 'Newsreader',
      data: semibold,
      weight: 600 as const,
      style: 'normal' as const,
    },
    italic && { name: 'Newsreader', data: italic, weight: 500 as const, style: 'italic' as const },
  ].filter((font) => font !== null)

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 88,
        background: BRAND.background,
        color: BRAND.foreground,
        fontFamily: 'Newsreader',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Mark size={64} />
        <span style={{ fontSize: 60, fontWeight: 600, letterSpacing: '-0.01em' }}>Lectheo</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 88,
          fontWeight: 500,
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
        }}
      >
        <span>Find what you missed.</span>
        <div style={{ display: 'flex' }}>
          <span style={{ color: BRAND.primary, fontStyle: 'italic', marginRight: 22 }}>Prove</span>
          <span>what you know.</span>
        </div>
      </div>
    </div>,
    // An empty `fonts` array disables next/og's default font and fails the build.
    fonts.length > 0 ? { ...size, fonts } : size,
  )
}
