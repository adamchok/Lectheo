import type { MasteryState } from '@lectheo/contracts'
import {
  AudioLines,
  FileText,
  FileVideo,
  Link,
  MessagesSquare,
  SearchCheck,
  Shuffle,
  Swords,
} from 'lucide-react'
import { MASTERY_META } from '@/components/mastery-meta'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Section } from './section'

const ACTIVITIES = [
  {
    icon: SearchCheck,
    name: 'Spot the flaw',
    does: 'Read a short explanation written by an AI "author" who believes it\'s right. Question them, find the flawed sentence and correct it. Some explanations have no flaw.',
    proves: 'You can judge an explanation, not just repeat one.',
  },
  {
    icon: MessagesSquare,
    name: 'Teach-back',
    does: 'Explain the idea to Sam, a curious first-year who asks follow-up questions.',
    proves: 'You can explain it clearly and completely.',
  },
  {
    icon: Shuffle,
    name: 'Transfer',
    does: 'Solve a problem the lecture never covered that needs the same idea.',
    proves: 'You can apply it somewhere new.',
  },
  {
    icon: Swords,
    name: 'Stump the AI',
    beta: true,
    does: "Write a hard question and your own answer key. A referee checks it's fair; then the AI tries to answer.",
    proves: 'You understand it well enough to test someone else.',
  },
] as const

export function Practice() {
  return (
    <Section
      id="practice-title"
      anchor="practice"
      eyebrow="Practice"
      title="Four ways to use an idea, not just recall it."
      lead="Each activity makes you reason. You get a guiding question and a second try before the answer is shown."
    >
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIVITIES.map((activity) => (
          <li
            key={activity.name}
            className="bg-card border-border flex flex-col gap-4 rounded-lg border p-6"
          >
            <div className="flex items-center gap-2">
              <activity.icon aria-hidden className="text-primary size-4" />
              <h3 className="text-title-md">{activity.name}</h3>
              {'beta' in activity && <Badge variant="secondary">Beta</Badge>}
            </div>
            <dl className="flex flex-1 flex-col gap-4">
              <dt className="sr-only">What you do</dt>
              <dd className="text-body text-pretty">{activity.does}</dd>
              <dt className="text-overline text-muted-foreground border-border mt-auto border-t pt-4">
                What it proves
              </dt>
              <dd className="text-body-sm text-muted-foreground -mt-2">{activity.proves}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted-foreground mt-6">
        The AI author never sees the flaw it&apos;s hiding, and its replies are checked so it
        can&apos;t give the answer away.
      </p>
    </Section>
  )
}

const STATES: ReadonlyArray<{ state: MasteryState; line: string }> = [
  { state: 'gray', line: "you haven't been asked yet." },
  { state: 'red', line: 'your last answer was wrong, or you have a confident mistake.' },
  { state: 'amber', line: "you've shown part of it." },
  { state: 'green', line: 'shown on your own, two different ways.' },
]

export function Mastery() {
  return (
    <Section
      id="mastery-title"
      eyebrow="Mastery"
      title="Green means you showed it. Twice."
      lead={
        <>
          Most apps mark a topic done after one right answer. In Lectheo a concept is{' '}
          <strong className="text-foreground font-semibold">Mastered</strong> only after two
          independent correct answers in two different activity types. Hints or a revealed
          explanation don&apos;t count as independent. If your last attempt was wrong, the concept
          goes back to Needs work.
        </>
      }
    >
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STATES.map(({ state, line }) => {
          const meta = MASTERY_META[state]
          return (
            <li key={state} className="space-y-2">
              {/* The badge's look without MasteryBadge, whose tooltip is client code. */}
              <span
                className={cn(
                  'text-label inline-flex h-6 items-center gap-1 rounded-sm px-2',
                  meta.badgeClass,
                )}
              >
                <meta.icon aria-hidden className="size-3.5" />
                {meta.label}
              </span>
              <p className="text-body text-muted-foreground">
                <span className="sr-only">: </span>
                {line}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="text-caption text-muted-foreground mt-8">
        No points, no streaks, no badges. Just what you understand.
      </p>
    </Section>
  )
}

const TRUST = [
  {
    title: 'Checked before you see it.',
    body: "Every question is solved blind by a second AI model, from a different company than the one that wrote it. Questions that don't check out are rewritten or dropped.",
  },
  {
    title: 'Graded against a fixed rubric.',
    body: "Answers are marked against criteria written before you start, by a separate judge, not the character you're talking to. Whatever can be checked exactly, like which sentence holds the flaw, is checked in code.",
  },
  {
    title: 'Always tied to the lecture.',
    body: 'Every concept, question and piece of feedback links to the moment in the lecture it came from (when the transcript has timestamps), so you can check it yourself.',
  },
] as const

export function WhyLectheo() {
  return (
    <Section
      id="why-lectheo-title"
      anchor="why-lectheo"
      eyebrow="Why Lectheo"
      title="Built to be right before it's clever."
    >
      <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
        {TRUST.map((item) => (
          <li key={item.title} className="border-border space-y-2 border-t pt-5">
            <h3 className="text-title-md">{item.title}</h3>
            <p className="text-body text-muted-foreground text-pretty">{item.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

const code = 'text-mono bg-muted rounded-sm px-1'

const SOURCES = [
  {
    icon: FileVideo,
    title: 'A recording with its transcript.',
    body: (
      <>
        Pick the video or audio file and its <code className={code}>.vtt</code> or{' '}
        <code className={code}>.srt</code> captions (Teams, Zoom and Panopto can export them). The
        video plays from your laptop and is never uploaded.
      </>
    ),
  },
  {
    icon: AudioLines,
    title: 'Audio only.',
    body: 'Upload the audio; Lectheo transcribes it, then deletes the audio.',
  },
  {
    icon: FileText,
    title: 'A transcript.',
    body: "Paste or upload the text. Without timestamps you can't mark moments, but you still get the map, the diagnosis and practice.",
  },
  {
    icon: Link,
    title: 'A YouTube video.',
    body: 'Paste the link. It plays through YouTube, and Lectheo builds the map from its transcript.',
  },
] as const

export function YourLectures() {
  return (
    <Section
      id="your-lectures-title"
      eyebrow="Your lectures"
      title="Try it on CS50, then bring your own."
      lead="The sample account comes with Harvard's CS50x Lectures 3, 4 and 5, ready to study, watch and practice. A Google account starts empty and is yours alone. Add your own lectures:"
    >
      <ul className="grid gap-8 md:grid-cols-3">
        {SOURCES.map((source) => (
          <li key={source.title} className="flex gap-3">
            <source.icon aria-hidden className="text-primary mt-1 size-4 shrink-0" />
            <p className="text-body text-muted-foreground text-pretty">
              <strong className="text-foreground font-semibold">{source.title}</strong>{' '}
              {source.body}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted-foreground mt-8">
        With a Google account, up to 3 lectures a day, each up to 2 hours.
      </p>
    </Section>
  )
}
