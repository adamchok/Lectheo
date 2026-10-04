import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Privacy policy' }

const CONTACT = 'adam.c11304@gmail.com'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="4 October 2026">
      <p>
        Lectheo is a study tool built for the ForgeHacks 2026 hackathon. This page explains what we
        store, who processes it, and how to delete it. We keep as little as we can.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Google sign-in:</strong> your name, email address and a Google account id (scopes{' '}
          <code>openid</code>, <code>email</code>, <code>profile</code> only). We never see your
          Google password.
        </li>
        <li>
          <strong>Sample accounts:</strong> an anonymous account with no personal details.
        </li>
        <li>
          <strong>Your study data:</strong> courses and lectures you add, lecture transcripts, the
          moments you mark (&ldquo;lost&rdquo; / &ldquo;important&rdquo;), your answers, confidence
          ratings, practice conversations and the resulting mastery state.
        </li>
        <li>
          <strong>Operational data:</strong> request logs (time, route, anonymous request id) and a
          record of AI calls (task, model, token counts, cost) used to keep the service within
          budget.
        </li>
      </ul>

      <h2>What we don&apos;t collect</h2>
      <ul>
        <li>
          <strong>Imported video never leaves your device.</strong> It plays from your own laptop;
          only its transcript is uploaded.
        </li>
        <li>
          Uploaded or recorded audio is deleted as soon as it has been transcribed, and the copy at
          the transcription provider is deleted too.
        </li>
        <li>Speaker names are removed from imported transcripts.</li>
        <li>No advertising, no tracking cookies, no selling of data.</li>
      </ul>

      <h2>Who processes your data</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — database, sign-in and file storage.
        </li>
        <li>
          <strong>Vercel</strong> — hosting, and the AI Gateway that routes AI requests.
        </li>
        <li>
          <strong>Anthropic, OpenAI, Google and TypeSafe</strong> (via Vercel AI Gateway) — generate
          questions, play the practice personas, check questions and grade answers. They receive
          lecture text and your practice answers, not your name or email.
        </li>
        <li>
          <strong>AssemblyAI</strong> — transcribes audio, only when you upload or record audio.
        </li>
        <li>
          <strong>Cloudflare Turnstile</strong> — bot check on the sample-account button.
        </li>
      </ul>

      <h2>Recording consent</h2>
      <p>
        Before you record or upload a lecture, Lectheo asks you to confirm you have permission to
        record or use it. Please respect your institution&apos;s rules and your classmates&apos;
        privacy.
      </p>

      <h2>Retention and deletion</h2>
      <ul>
        <li>Sample accounts and all their data are deleted automatically after 24 hours.</li>
        <li>Deleting a lecture removes its transcript, markers, questions and practice history.</li>
        <li>
          Google accounts are kept until you ask us to delete them. Email{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will delete your account and all its
          data.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  )
}
