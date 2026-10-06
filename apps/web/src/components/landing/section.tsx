import { getImageProps, type StaticImageData } from 'next/image'
import type { ReactNode } from 'react'
import { preload as preloadResource } from 'react-dom'
import { cn } from '@/lib/utils'

/** Landing container: `content-max` with the app's gutters (Design System §5). */
export const CONTAINER = 'mx-auto w-full max-w-content px-4 sm:px-6'

interface SectionProps {
  /** Heading id, for aria-labelledby. */
  id: string
  /** Nav anchor on the section itself (How it works, Practice …). */
  anchor?: string
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  children?: ReactNode
  className?: string
}

/** One landing section: optional overline, display-lg title, body-lg lead, then content. */
export function Section({ id, anchor, eyebrow, title, lead, children, className }: SectionProps) {
  return (
    <section
      id={anchor}
      aria-labelledby={id}
      className={cn('border-border border-t py-16 lg:py-24', className)}
    >
      <div className={CONTAINER}>
        <div className="max-w-reading space-y-4">
          {eyebrow && <p className="text-overline text-muted-foreground">{eyebrow}</p>}
          <h2 id={id} className="text-display-lg text-balance">
            {title}
          </h2>
          {lead && <p className="text-body-lg text-muted-foreground text-pretty">{lead}</p>}
        </div>
        {children && <div className="mt-12">{children}</div>}
      </div>
    </section>
  )
}

interface ScreenshotProps {
  light: StaticImageData
  dark: StaticImageData
  alt: string
  sizes: string
  /** The hero image only (Design System §5: one priority image). */
  preload?: boolean
}

const VARIANTS = [
  { theme: 'light', media: '(prefers-color-scheme: light)', className: 'dark:hidden' },
  { theme: 'dark', media: '(prefers-color-scheme: dark)', className: 'hidden dark:block' },
] as const

/**
 * A real app screenshot in its frame, light or dark to match the viewer's theme (next-themes puts
 * `.dark` on <html> before paint). Below the fold both are lazy, and a lazy display:none image is
 * never fetched. The hero preloads only the variant for the system theme (a `media` preload) and
 * loads both eagerly at low priority, so the hidden one never competes for LCP.
 */
export function Screenshot({ light, dark, alt, sizes, preload = false }: ScreenshotProps) {
  return (
    <div className="bg-card shadow-frame overflow-hidden rounded-xl">
      {VARIANTS.map(({ theme, media, className }) => {
        const { props } = getImageProps({ src: theme === 'light' ? light : dark, alt, sizes })
        if (preload) {
          preloadResource(props.src, {
            as: 'image',
            imageSrcSet: props.srcSet,
            imageSizes: props.sizes,
            fetchPriority: 'high',
            media,
          })
        }
        return (
          // eslint-disable-next-line @next/next/no-img-element -- props come from getImageProps
          <img
            key={theme}
            {...props}
            alt={alt}
            loading={preload ? 'eager' : 'lazy'}
            fetchPriority={preload ? 'low' : undefined}
            className={cn('h-auto w-full', className)}
          />
        )
      })}
    </div>
  )
}
