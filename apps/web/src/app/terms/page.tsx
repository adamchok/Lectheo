import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Terms of service' }

const CONTACT = 'adam.c11304@gmail.com'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="4 October 2026">
      <p>
        Lectheo is a free prototype built for the ForgeHacks 2026 hackathon. By using it you agree
        to these terms.
      </p>

      <h2>The service</h2>
      <ul>
        <li>
          Lectheo is provided &ldquo;as is&rdquo;, without warranty. It may change, break or be shut
          down at any time, and data may be lost.
        </li>
        <li>
          Questions, feedback and grades are generated and checked by AI. They are usually right,
          but they can be wrong. Lectheo is a study aid, not a substitute for your course materials
          or instructors.
        </li>
        <li>Daily usage limits apply to keep the service available for everyone.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>
          Only record or upload lectures you have permission to record or use, and follow your
          institution&apos;s rules.
        </li>
        <li>
          Don&apos;t upload content you don&apos;t have the right to share, and don&apos;t try to
          abuse, overload or break the service.
        </li>
        <li>
          Your study data stays yours. See the <Link href="/privacy">privacy policy</Link>.
        </li>
      </ul>

      <h2>Library content</h2>
      <p>
        CS50x 2026 by Harvard University, licensed{' '}
        <a href="https://cs50.harvard.edu/x/license/">CC BY-NC-SA 4.0</a>. Adapted by Lectheo
        (questions and maps generated). Not affiliated with or endorsed by CS50. Generated library
        content is shared under the same license. Videos are embedded from YouTube, not re-hosted.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalPage>
  )
}
