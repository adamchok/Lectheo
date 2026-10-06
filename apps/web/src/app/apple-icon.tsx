import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/site'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** Home-screen icon: the lens mark on paper, full bleed (iOS rounds the corners). */
export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND.background,
      }}
    >
      <svg width={120} height={120} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9.25" stroke={BRAND.primary} strokeWidth="2" />
        <circle cx="14.25" cy="9.75" r="3.25" fill={BRAND.primary} />
      </svg>
    </div>,
    size,
  )
}
