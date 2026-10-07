'use client'

import type { BriefConcept, BriefResponse, LectureResponse } from '@lectheo/contracts'
import { briefReadMinutes } from '@lectheo/domain'
import { ClipboardCheck, FileText } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { pluralize } from '@/client/format'
import { useBrief } from '@/client/study'
import { DeleteLectureButton } from '@/components/capture/delete-lecture-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LectureModes } from './lecture-modes'
import { chapterSectionId, StudyChapter } from './study-chapter'
import { StudyConcept, type OpenPart } from './study-concept'
import { JumpTo, StudyOutline, useSectionInView, type OutlineEntry } from './study-outline'

/*
 * /lectures/[id] in Study mode (Product Spec F9, Design System §4 "Lecture: Study"): the brief by
 * chapter with an outline (F9.10–F9.11), or one flat column in learning order for lectures
 * without chapters. Test me at the top and the end. No progress tracking (F9.6).
 */

/** "6 concepts · about 15 min to read · 40 min with depth · 45 min of video · 8 chapters". */
function briefCaption(brief: BriefResponse, chapters: number): string {
  const read = Math.max(1, brief.readMinutes)
  return [
    pluralize(brief.concepts.length, 'concept'),
    `about ${read} min to read`,
    brief.depthMinutes > 0 ? `${read + brief.depthMinutes} min with depth` : null,
    brief.videoMinutes ? `${brief.videoMinutes} min of video` : null,
    chapters > 0 ? pluralize(chapters, 'chapter') : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Test me = the diagnostic; shown from map_ready, usable once its questions are checked. */
function TestMe({ lecture }: { lecture: LectureResponse }) {
  const reasonId = useId()
  if (lecture.status === 'ready') {
    return (
      <Button asChild>
        <Link href={`/lectures/${lecture.id}/diagnostic` as Route}>
          <ClipboardCheck aria-hidden />
          Test me
        </Link>
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button aria-disabled aria-describedby={reasonId} className="opacity-50">
        <ClipboardCheck aria-hidden />
        Test me
      </Button>
      <span id={reasonId} className="text-caption text-muted-foreground">
        Opens once the questions are ready.
      </span>
    </span>
  )
}

function BriefSkeleton() {
  return (
    <Skeleton label="Loading the study brief" className="space-y-8">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-8 w-56" />
        </div>
      ))}
    </Skeleton>
  )
}

/** /lectures/{id}#concept-{id} (the map's "Read about it"): scroll there once the brief is in. */
function useConceptAnchor(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.slice(1)
    if (!id.startsWith('concept-')) return
    const block = document.getElementById(id)
    block?.scrollIntoView({ block: 'start' })
    block?.querySelector<HTMLElement>('h2, h3')?.focus({ preventScroll: true })
  }, [ready])
}

interface ChapterGroup {
  chapter: LectureResponse['chapters'][number]
  concepts: BriefConcept[]
  revisits: BriefConcept[]
}

/** F9.11: what the outline says under a chapter's title. */
function outlineCaption({ concepts, revisits }: ChapterGroup): string {
  if (concepts.length > 0) return `${Math.max(1, briefReadMinutes(concepts))} min read`
  if (revisits.length > 0) return `Revisits ${pluralize(revisits.length, 'concept')}`
  return 'No concepts'
}

/** F9.10: the brief's concepts under the lecture's chapters (the server already placed them). */
function groupByChapter(lecture: LectureResponse, concepts: readonly BriefConcept[]) {
  const groups: ChapterGroup[] = lecture.chapters.map((chapter) => ({
    chapter,
    concepts: concepts.filter((c) => c.chapter?.id === chapter.id),
    revisits: concepts.filter((c) => c.alsoIn.includes(chapter.id)),
  }))
  const ids = new Set(lecture.chapters.map((ch) => ch.id))
  // A brief fetched across a re-process may name a chapter the lecture no longer has.
  const unplaced = concepts.filter((c) => !c.chapter || !ids.has(c.chapter.id))
  const outline: OutlineEntry[] = groups.map((g, i) => ({
    id: chapterSectionId(g.chapter.id),
    number: i + 1,
    title: g.chapter.title,
    caption: outlineCaption(g),
    empty: g.concepts.length === 0 && g.revisits.length === 0,
  }))
  return { groups, unplaced, outline }
}

/** One player at a time: a concept's clips or moment, or a chapter. */
interface OpenPlayer {
  owner: string
  part: OpenPart
}

export interface StudyViewProps {
  lecture: LectureResponse
  courseTitle: string
}

export function StudyView({ lecture, courseTitle }: StudyViewProps) {
  const brief = useBrief(lecture.id)
  useConceptAnchor(Boolean(brief.data))
  const [open, setOpen] = useState<OpenPlayer | null>(null)
  const userLecture = lecture.source !== 'library'
  const concepts = brief.data?.concepts ?? []
  const onPage = new Set(concepts.map((c) => c.id))
  const byChapter = lecture.chapters.length > 0 && concepts.length > 0
  const { groups, unplaced, outline } = groupByChapter(lecture, byChapter ? concepts : [])
  const inView = useSectionInView(byChapter ? outline.map((e) => e.id) : [])

  const conceptBlock = (c: BriefConcept, headingLevel: 2 | 3) => (
    <StudyConcept
      key={c.id}
      lecture={lecture}
      concept={c}
      onPage={onPage}
      headingLevel={headingLevel}
      open={open?.owner === c.id ? open.part : null}
      onOpen={(part) => setOpen(part === null ? null : { owner: c.id, part })}
    />
  )
  const playChapter = (chapterId: string) => (on: boolean) =>
    setOpen(on ? { owner: chapterSectionId(chapterId), part: 'clips' } : null)

  return (
    <div
      className={cn(
        'mx-auto',
        byChapter ? 'max-w-[calc(var(--reading-max)+16rem)]' : 'max-w-reading',
      )}
    >
      <PageChrome
        crumbs={[
          { label: courseTitle, href: `/courses/${lecture.courseId}` as Route },
          { label: `Lecture ${lecture.seq}` },
        ]}
        title={`Study · Lecture ${lecture.seq}`}
        courseId={lecture.courseId}
        actions={
          <>
            <LectureModes lecture={lecture} current="study" className="max-sm:hidden" />
            {userLecture && <DeleteLectureButton lecture={lecture} />}
          </>
        }
      />
      <LectureModes lecture={lecture} current="study" className="mb-6 sm:hidden" />
      <div className={cn(byChapter && 'lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:gap-10')}>
        {byChapter && (
          <aside className="max-lg:hidden">
            <StudyOutline entries={outline} inView={inView} footer={<TestMe lecture={lecture} />} />
          </aside>
        )}
        <div className="min-w-0">
          <PageHeader
            eyebrow={`Lecture ${lecture.seq} · Study`}
            title={lecture.title}
            description={brief.data ? briefCaption(brief.data, lecture.chapters.length) : undefined}
            actions={<TestMe lecture={lecture} />}
          />
          {byChapter && (
            <div className="contents lg:hidden">
              <JumpTo entries={outline} inView={inView} />
            </div>
          )}

          {brief.isPending && <BriefSkeleton />}
          {brief.isError && (
            <ErrorState
              title="Couldn't load the study brief"
              error={brief.error}
              onRetry={() => brief.refetch()}
            />
          )}
          {brief.data?.concepts.length === 0 && (
            <EmptyState
              icon={FileText}
              title="Nothing to study in this lecture"
              description="We didn't find teachable concepts in it, so there's no brief. The transcript is still here."
              action={
                <Button asChild variant="outline">
                  <Link href={`/lectures/${lecture.id}?view=transcript` as Route}>
                    Open the transcript
                  </Link>
                </Button>
              }
            />
          )}
          {concepts.length > 0 && (
            <>
              {byChapter ? (
                <div className="pb-8">
                  {groups.map((g, i) => (
                    <StudyChapter
                      key={g.chapter.id}
                      lecture={lecture}
                      chapter={g.chapter}
                      number={i + 1}
                      revisits={g.revisits}
                      playing={open?.owner === chapterSectionId(g.chapter.id)}
                      onPlay={playChapter(g.chapter.id)}
                    >
                      {g.concepts.length > 0
                        ? g.concepts.map((c) => conceptBlock(c, 3))
                        : undefined}
                    </StudyChapter>
                  ))}
                  {unplaced.length > 0 && (
                    <div className="divide-border border-border divide-y border-t pt-8">
                      {unplaced.map((c) => conceptBlock(c, 2))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-border divide-y">
                  {concepts.map((c) => conceptBlock(c, 2))}
                </div>
              )}
              <section
                aria-label="Test me"
                className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-8"
              >
                <p className="text-title-md text-balance">
                  Ready? Find out what you misunderstood.
                </p>
                <TestMe lecture={lecture} />
              </section>
            </>
          )}
          {lecture.source === 'library' && <LicenseNotice className="mt-10" />}
        </div>
      </div>
    </div>
  )
}
