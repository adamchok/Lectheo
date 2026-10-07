'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { AudioLines, FileText, FileVideo, Link } from 'lucide-react'
import { useRef, useState } from 'react'
import { newId } from '@/client/ids'
import {
  type CreateLectureInput,
  useCourses,
  useCreateCourse,
  useCreateLecture,
  useMe,
} from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AudioForm } from './audio-form'
import { ConsentCheckbox, useConsent } from './consent'
import { type CourseChoice, CoursePicker } from './course-picker'
import { RequiredMark } from './form-parts'
import { ImportForm } from './import-form'
import { TranscriptForm } from './transcript-form'
import { YoutubeForm } from './youtube-form'

export interface DraftInput {
  source: CreateLectureInput['source']
  media?: CreateLectureInput['media']
  youtubeUrl?: string
  /** Identity of the picked file(s) / text: a changed input gets a fresh lecture id. */
  fileKey: string
}

/**
 * Creates the course (if new) and the draft lecture. Ids are reused only for an identical
 * retry (same source, course, title and file), so a retry replays instead of spending quota,
 * while a corrected retry never gets the old row back.
 */
export type CreateDraft = (input: DraftInput) => Promise<LectureResponse>

export interface DraftFormProps {
  /** Steps still missing outside the form (course, title, consent); empty when all are set. */
  missing: readonly string[]
  isSample: boolean
  createDraft: CreateDraft
}

/** Inactive tabs stay mounted (hidden) so a picked file survives switching tabs. */
const tabPanelClass = 'pt-4 data-[state=inactive]:hidden'

/** Returns the id stored under `key`, creating one on first use. */
function idFor(ids: Map<string, string>, key: string): string {
  const existing = ids.get(key)
  if (existing) return existing
  const id = newId()
  ids.set(key, id)
  return id
}

type CaptureTab = 'import' | 'audio' | 'transcript' | 'youtube'
const isCaptureTab = (value: string): value is CaptureTab =>
  ['import', 'audio', 'transcript', 'youtube'].includes(value)

/**
 * /lectures/new: "add your own lecture" (F0.7, F1 modes B and D, F1.11, F10). `youtube`: the F10
 * switch (server/features.ts), read by the page on the server.
 */
export function NewLectureView({ youtube: youtubeEnabled }: { youtube: boolean }) {
  const me = useMe()
  const courses = useCourses()
  const consent = useConsent()
  const createCourse = useCreateCourse()
  const createLecture = useCreateLecture()
  const [title, setTitle] = useState('')
  const [choice, setChoice] = useState<CourseChoice | null>(null)
  const [tab, setTab] = useState<CaptureTab>('import')
  const courseIds = useRef(new Map<string, string>())
  const lectureIds = useRef(new Map<string, string>())

  if (courses.isPending || me.isPending) {
    return (
      <Skeleton label="Loading" className="max-w-2xl space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </Skeleton>
    )
  }
  if (courses.isError) {
    return (
      <ErrorState
        title="Couldn't load your courses"
        error={courses.error}
        onRetry={() => courses.refetch()}
      />
    )
  }

  const isSample = me.data?.isSample ?? false
  const personal = courses.data.filter((course) => course.kind === 'personal')
  const canCreate = !(isSample && personal.length > 0)
  const firstCourse = personal[0]
  // A "new course" choice is dropped once it can't be created (a sample account's one course).
  const usable = choice && !(choice.kind === 'new' && !canCreate) ? choice : null
  const course: CourseChoice =
    usable ?? (firstCourse ? { kind: 'existing', id: firstCourse.id } : { kind: 'new', title: '' })
  // A YouTube lecture takes the video's title by default and asks its own consent (F10.4).
  const youtube = youtubeEnabled && tab === 'youtube'
  const missing = [
    course.kind === 'new' && !course.title.trim() && 'name the course',
    !youtube && !title.trim() && 'add a title',
    !youtube && !consent.given && 'confirm you have permission',
  ].filter((step): step is string => Boolean(step))

  const createDraft: CreateDraft = async ({ source, media, youtubeUrl, fileKey }) => {
    const lectureTitle = title.trim() || undefined
    let courseId: string
    if (course.kind === 'existing') {
      courseId = course.id
    } else {
      const courseTitle = course.title.trim()
      const id = idFor(courseIds.current, courseTitle)
      courseId = (await createCourse.mutateAsync({ id, title: courseTitle })).id
    }
    const key = JSON.stringify([source, courseId, lectureTitle, fileKey])
    const id = idFor(lectureIds.current, key)
    return createLecture.mutateAsync({
      id,
      courseId,
      title: lectureTitle,
      source,
      media,
      youtubeUrl,
    })
  }
  const formProps: DraftFormProps = { missing, isSample, createDraft }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Hidden from screen readers: each field announces "required" itself. */}
      <p aria-hidden className="text-caption text-muted-foreground">
        Fields marked <RequiredMark /> are required.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CoursePicker
          courses={personal}
          canCreate={canCreate}
          value={course}
          onChange={setChoice}
        />
        <div className="space-y-2">
          <Label htmlFor="lecture-title">
            Lecture title{' '}
            {youtube ? <span className="text-muted-foreground">(optional)</span> : <RequiredMark />}
          </Label>
          <Input
            id="lecture-title"
            required={!youtube}
            placeholder={youtube ? undefined : 'e.g. Week 6 · Trees'}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-describedby={youtube ? 'lecture-title-help' : undefined}
          />
          {youtube && (
            <p id="lecture-title-help" className="text-caption text-muted-foreground">
              Defaults to the video’s title.
            </p>
          )}
        </div>
      </div>
      {!youtube && <ConsentCheckbox consent={consent} />}
      <Tabs
        value={tab}
        onValueChange={(value) => isCaptureTab(value) && setTab(value)}
        className="bg-card rounded-xl border p-4 sm:p-6"
      >
        {/* Four tabs wrap onto two rows on narrow screens; the list grows with them. */}
        <TabsList className="flex-wrap group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="import">
            <FileVideo aria-hidden />
            Recording + transcript
          </TabsTrigger>
          <TabsTrigger value="audio">
            <AudioLines aria-hidden />
            Audio
          </TabsTrigger>
          <TabsTrigger value="transcript">
            <FileText aria-hidden />
            Transcript only
          </TabsTrigger>
          {youtubeEnabled && (
            <TabsTrigger value="youtube">
              <Link aria-hidden />
              From YouTube
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="import" forceMount className={tabPanelClass}>
          <ImportForm
            {...formProps}
            onSuggestTitle={(suggested) => setTitle((current) => current || suggested)}
          />
        </TabsContent>
        <TabsContent value="audio" forceMount className={tabPanelClass}>
          <AudioForm {...formProps} />
        </TabsContent>
        <TabsContent value="transcript" forceMount className={tabPanelClass}>
          <TranscriptForm {...formProps} />
        </TabsContent>
        {youtubeEnabled && (
          <TabsContent value="youtube" forceMount className={tabPanelClass}>
            <YoutubeForm {...formProps} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
