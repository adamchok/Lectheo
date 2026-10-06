import { ClipboardCheck, MessageCircleQuestion, Play } from 'lucide-react'
import { KeyHint } from '@/components/key-hint'
import { SignInActions } from '@/components/sign-in/sign-in-actions'
import { CONTAINER, Screenshot, Section } from './section'
import diagnosticDark from './screenshots/diagnostic-result-dark.png'
import diagnosticLight from './screenshots/diagnostic-result-light.png'
import heroDark from './screenshots/hero-map-dark.png'
import heroLight from './screenshots/hero-map-light.png'

/** Product words are bold; italics are kept for the hero's "Prove" (Design System §1). */
const term = 'text-foreground font-semibold'

export function Hero({ authError }: { authError: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="pt-12 pb-16 lg:pt-20 lg:pb-24">
      <div className={`${CONTAINER} space-y-12 lg:space-y-16`}>
        <div className="max-w-3xl space-y-8">
          <div className="space-y-5">
            <p className="text-overline text-primary">For CS students who learn from lectures</p>
            <h1 id="hero-title" className="text-display-xl text-balance">
              Find what you missed. <em className="text-primary">Prove</em> what you know.
            </h1>
            <p className="text-body-lg text-muted-foreground max-w-[60ch] text-pretty">
              Mark the moments you get lost. Lectheo turns them into a short diagnosis of what you
              actually misunderstand, then makes you reason with those ideas until you can show you
              know them.
            </p>
          </div>
          <SignInActions authError={authError} />
          <div className="text-caption text-muted-foreground space-y-1">
            <p>
              No sign-up for the sample. It&apos;s a student partway through Harvard&apos;s CS50x,
              and it&apos;s deleted after 24 hours.
            </p>
            <p>Lectheo is said LEK-thee-oh.</p>
          </div>
        </div>
        <Screenshot
          light={heroLight}
          dark={heroDark}
          preload
          sizes="(min-width: 1280px) 1232px, calc(100vw - 32px)"
          alt="A concept map of a CS50 lecture. Hash tables is marked Needs work with a confident mistake; arrays and linked lists are Mastered."
        />
      </div>
    </section>
  )
}

export function Problem() {
  return (
    <Section
      id="problem-title"
      title="Rewatching doesn't tell you what you got wrong."
      lead="After a lecture you know which parts felt hard. You don't know which ideas you've quietly misunderstood, because those feel fine. Notes and flashcards repeat the lecture back to you. They can't find the mistake you're sure isn't one."
    />
  )
}

const STEPS = [
  {
    title: 'Mark while you watch.',
    body: (
      <>
        Press <KeyHint>L</KeyHint> when you&apos;re lost and <KeyHint>I</KeyHint> when something
        matters. No pausing, no notes. Your marks sit on the lecture&apos;s timeline.
      </>
    ),
  },
  {
    title: 'See the lecture as a map.',
    body: 'Lectheo builds a concept map of the lecture and shows how ideas depend on each other. Your marks land on the concepts they belong to, so confusion is traced back to where it started.',
  },
  {
    title: 'Get a diagnosis, not a quiz.',
    body: (
      <>
        A short diagnostic asks how sure you are <em className={term}>before</em> you see the
        options. Sure and wrong, twice, is a <strong className={term}>confident mistake</strong>:
        the gap you didn&apos;t feel. Each result links to the moment in the lecture that explains
        it.
      </>
    ),
  },
  {
    title: "Practice until it's proven.",
    body: (
      <>
        Lectheo picks what to practice from your diagnosis. A concept turns{' '}
        <strong className={term}>Mastered</strong> only when you&apos;ve shown it on your own, in
        two different kinds of activity.
      </>
    ),
  },
] as const

export function HowItWorks() {
  return (
    <Section
      id="how-it-works-title"
      anchor="how-it-works"
      eyebrow="How it works"
      title={<>From &ldquo;I&apos;m lost&rdquo; to proven, in four steps.</>}
    >
      <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-border space-y-2 border-t pt-5">
            <span className="text-mono-sm text-primary">0{index + 1}</span>
            <h3 className="text-title-md">{step.title}</h3>
            <p className="text-body text-muted-foreground text-pretty">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

const DIAGNOSIS_POINTS = [
  {
    icon: ClipboardCheck,
    text: "Confidence before options, so you can't adjust after seeing them.",
  },
  {
    icon: MessageCircleQuestion,
    text: "A follow-up on the same idea where possible, so one slip isn't treated as a misconception.",
  },
  { icon: Play, text: 'Every answer explained, with a link to the lecture moment.' },
] as const

export function Diagnosis() {
  return (
    <Section
      id="diagnosis-title"
      eyebrow="Diagnosis"
      title="The mistakes you're sure about matter most."
      lead="Getting something wrong when you guessed is normal. Getting it wrong when you were sure means you'll keep getting it wrong, in the exam too. Lectheo asks for your confidence first, follows up on sure-but-wrong answers with a second question on the same idea where it can, and flags a confident mistake when you're sure and wrong."
    >
      <div className="grid items-center gap-12 lg:grid-cols-[2fr_3fr]">
        <ul className="space-y-5">
          {DIAGNOSIS_POINTS.map((point) => (
            <li key={point.text} className="text-body flex gap-3">
              <point.icon aria-hidden className="text-primary mt-1 size-4 shrink-0" />
              <span>{point.text}</span>
            </li>
          ))}
        </ul>
        <Screenshot
          light={diagnosticLight}
          dark={diagnosticDark}
          sizes="(min-width: 1280px) 720px, (min-width: 1024px) 58vw, calc(100vw - 32px)"
          alt="A diagnostic result: a confident mistake on hash tables, with why the chosen answer was wrong and a link to the lecture moment that explains it."
        />
      </div>
    </Section>
  )
}
