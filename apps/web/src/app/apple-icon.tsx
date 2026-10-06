import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// ponytail: brand-mark colours are literal (ImageResponse has no CSS tokens); same as icon.svg.
const PRIMARY = '#2b4acb'
const ON_PRIMARY = '#ffffff'

/** Home-screen icon for iOS: the lens mark from icon.svg, full-bleed (iOS rounds the corners). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: PRIMARY,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="9" fill="none" stroke={ON_PRIMARY} strokeWidth="2.25" />
          <circle cx="18.25" cy="13.75" r="3.25" fill={ON_PRIMARY} />
        </svg>
      </div>
    ),
    size,
  )
}
