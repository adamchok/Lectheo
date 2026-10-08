import type { Metadata } from 'next'
import { FinalCta, LandingFooter } from '@/components/landing/closing'
import { Comparison, Faq } from '@/components/landing/decision-sections'
import { LandingHeader } from '@/components/landing/landing-header'
import { Mastery, Practice, WhyLectheo, YourLectures } from '@/components/landing/product-sections'
import { Diagnosis, Hero, HowItWorks, Problem } from '@/components/landing/story-sections'
import { SkipLink } from '@/components/skip-link'

const TITLE = 'Lectheo · Find what you missed. Prove what you know.'
const DESCRIPTION =
  "Lectheo finds what you don't understand in a lecture, then makes you reason with it. Confidence-rated diagnosis and practice for concept-heavy courses."

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Lectheo',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

/** Public landing page (Design System §5, Landing Copy). Signed-in visitors never see it (proxy). */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <LandingHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Hero />
        <Problem />
        <HowItWorks />
        <Diagnosis />
        <Practice />
        <Mastery />
        <WhyLectheo />
        <YourLectures />
        <Comparison />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
