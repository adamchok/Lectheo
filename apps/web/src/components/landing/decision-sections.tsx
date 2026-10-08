import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Section } from './section'

const COLUMNS = ['Lectheo', 'AI note takers', 'AI notebooks', 'AI tutor chat modes'] as const

/** `true` = ✓ ("Yes"), `false` = — ("No"), a string reads as written. */
type Cell = boolean | string

const ROWS: ReadonlyArray<{ label: ReactNode; cells: readonly [Cell, Cell, Cell, Cell] }> = [
  {
    label: (
      <>
        Starts from where <em>you</em> got lost
      </>
    ),
    cells: [true, false, false, false],
  },
  { label: 'Asks how sure you are before you answer', cells: [true, false, false, false] },
  { label: 'Finds confident mistakes', cells: [true, false, false, false] },
  {
    label: 'Practice that needs reasoning, not recall',
    cells: [true, 'Mostly flashcards and quizzes', 'Some', true],
  },
  {
    label: 'Questions checked by a second AI before you see them',
    cells: [true, false, false, false],
  },
  { label: 'Feedback links to the lecture moment', cells: [true, 'Some', true, false] },
  { label: 'Mastery needs two kinds of evidence', cells: [true, false, false, false] },
  { label: 'Flashcards', cells: ['— by design', true, true, 'Some'] },
]

function CellContent({ cell }: { cell: Cell }) {
  if (typeof cell === 'string') {
    // "— by design": the dash is a "No", said in words for screen readers.
    if (cell.startsWith('— ')) {
      return (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">No,</span> {cell.slice(2)}
        </>
      )
    }
    return <>{cell}</>
  }
  return (
    <>
      <span aria-hidden>{cell ? '✓' : '—'}</span>
      <span className="sr-only">{cell ? 'Yes' : 'No'}</span>
    </>
  )
}

export function Comparison() {
  return (
    <Section id="comparison-title" title="Not another note taker.">
      {/* Scrolls inside its own container on narrow screens (Design System §1 Layout). */}
      <div
        role="region"
        aria-labelledby="comparison-caption"
        tabIndex={0}
        // relative: the cells' sr-only text is absolute and would widen the page otherwise.
        className="border-border relative overflow-x-auto rounded-lg border"
      >
        <table className="text-body-sm w-full min-w-[40rem] border-collapse text-left">
          <caption
            id="comparison-caption"
            className="text-caption text-muted-foreground caption-bottom px-4 py-3 text-left"
          >
            {/* Wraps inside the visible part of the scroller on narrow screens. */}
            <span className="block max-w-[calc(100vw-4rem)] sm:max-w-none">
              How Lectheo compares with common kinds of study tools. Based on public product
              information, October 2026.
            </span>
          </caption>
          <thead>
            <tr className="border-border border-b">
              <td className="w-[34%] p-4" />
              {COLUMNS.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'p-4 align-bottom font-semibold',
                    index === 0 && 'bg-accent text-accent-foreground',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {ROWS.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row" className="p-4 font-normal">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={COLUMNS[index]}
                    className={cn(
                      'p-4',
                      index === 0
                        ? 'bg-accent text-accent-foreground font-semibold'
                        : 'text-muted-foreground',
                    )}
                  >
                    <CellContent cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

const link = 'text-primary underline underline-offset-4'
const strong = 'text-foreground font-semibold'

const FAQ: ReadonlyArray<{ question: string; answer: ReactNode }> = [
  {
    question: 'What is Lectheo?',
    answer:
      'An AI study partner for lectures. It finds what you personally don\'t understand, using your "I\'m lost" marks and a confidence-rated diagnostic, then gives you practice that makes you reason with those ideas.',
  },
  {
    question: 'Who is it for?',
    answer:
      "Students in concept-heavy courses (computer science, engineering, the sciences, economics) who learn from lectures, live or recorded. It's built and tested on computer science first: the sample uses CS50x.",
  },
  {
    question: 'Do I need an account to try it?',
    answer: (
      <>
        No. <strong className={strong}>Try the sample account</strong> gives you your own copy of a
        student partway through CS50x, with Lecture 5 ready to study. It&apos;s deleted after 24
        hours. To add your own lectures, continue with Google. Your account starts empty: just your
        courses, nothing preloaded.
      </>
    ),
  },
  {
    question: 'Do I have to watch the whole lecture?',
    answer:
      'No. Study the brief in a few minutes, watch only the parts you got stuck on, then get tested.',
  },
  {
    question: 'What happens to my lecture recordings?',
    answer: (
      <>
        Video never leaves your laptop; only the transcript is uploaded. Audio you upload is deleted
        as soon as it&apos;s transcribed, and so is the transcription provider&apos;s copy. Speaker
        names are removed from transcripts. Deleting a lecture deletes everything made from it. You
        can delete your account at any time from the account menu. Details are in the{' '}
        <Link href="/privacy" className={link}>
          privacy policy
        </Link>
        .
      </>
    ),
  },
  {
    question: 'Which AI does it use, and can it be wrong?',
    answer:
      'Several models through one gateway: one writes questions, a model from a different company checks them, and a separate judge grades against a fixed rubric. It can still be wrong, which is why every result links to the lecture so you can check it.',
  },
  {
    question: 'Will it just give me the answers?',
    answer:
      "No. You get a guiding question and a second try first. You can ask for the explanation early, but then that attempt doesn't count towards Mastered.",
  },
  {
    question: 'Why no flashcards or streaks?',
    answer:
      'Plenty of apps help you remember. Lectheo checks whether you can use what you remember. Streaks reward opening the app, not understanding.',
  },
  {
    question: 'Who made it?',
    answer: (
      <>
        Lectheo is built by Adam Chok, a computer science master&apos;s student. It started at
        ForgeHacks 2026 and is open source on{' '}
        <a href="https://github.com/adamchok/Lectheo" className={link}>
          GitHub
        </a>
        .
      </>
    ),
  },
]

export function Faq() {
  return (
    <Section id="faq-title" anchor="faq" title="FAQ">
      <div className="max-w-reading divide-border border-border divide-y border-y">
        {FAQ.map((item) => (
          <details key={item.question} className="group">
            <summary className="text-heading flex cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronRight
                aria-hidden
                className="text-muted-foreground duration-fast size-4 shrink-0 transition-transform group-open:rotate-90"
              />
            </summary>
            <p className="text-body text-muted-foreground pb-5 text-pretty">{item.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}
