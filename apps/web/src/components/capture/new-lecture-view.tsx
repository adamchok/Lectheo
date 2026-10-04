'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { AudioLines, FileText, FileVideo } from 'lucide-react'
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
import { ImportForm } from './import-form'
import { TranscriptForm } from './transcript-form'

/** Creates the course (if new) and the draft lecture; ids are kept so retries replay. */
export type CreateDraft = (
  source: CreateLectureInput['source'],
  media?: CreateLectureInput['media'],
) => Promise<LectureResponse>

export interface DraftFormProps {
  /** Course, title and consent are all set. */
  ready: boolean
  createDraft: CreateDraft
}

/** /lectures/new: "add your own lecture" (F0.7, F1 modes B and D, F1.11). */
export function NewLectureView() {
  const me = useMe()
  const courses = useCourses()
  const consent = useConsent()
  const createCourse = useCreateCourse()
  const createLecture = useCreateLecture()
  const [title, setTitle] = useState('')
  const [choice, setChoice] = useState<CourseChoice | null>(null)
  const newCourseId = useRef(newId())
  const lectureIds = useRef(new Map<string, string>())

  if (courses.isPending || me.isPending) {
    return (
      <div aria-busy aria-label="Loading" className="max-w-2xl space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
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

  const personal = courses.data.filter((course) => course.kind === 'personal')
  const canCreate = !(me.data?.isSample && personal.length > 0)
  const firstCourse = personal[0]
  const course: CourseChoice =
    choice ?? (firstCourse ? { kind: 'existing', id: firstCourse.id } : { kind: 'new', title: '' })
  const missing = [
    course.kind === 'new' && !course.title.trim() && 'name the course',
    !title.trim() && 'add a title',
    !consent.given && 'confirm you have permission',
  ].filter((step): step is string => Boolean(step))
  const ready = missing.length === 0

  const createDraft: CreateDraft = async (source, media) => {
    const courseId =
      course.kind === 'existing'
        ? course.id
        : (await createCourse.mutateAsync({ id: newCourseId.current, title: course.title.trim() }))
            .id
    const id = lectureIds.current.get(source) ?? newId()
    lectureIds.current.set(source, id)
    return createLecture.mutateAsync({ id, courseId, title: title.trim(), source, media })
  }
  const formProps: DraftFormProps = { ready, createDraft }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <CoursePicker courses={personal} canCreate={canCreate} value={course} onChange={setChoice} />
        <div className="space-y-2">
          <Label htmlFor="lecture-title">Lecture title</Label>
          <Input
            id="lecture-title"
            placeholder="e.g. Week 6 · Trees"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>
      <ConsentCheckbox consent={consent} />
      <Tabs defaultValue="import" className="bg-card rounded-xl border p-4 sm:p-6">
        <TabsList className="flex-wrap">
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
        </TabsList>
        <TabsContent value="import" className="pt-4">
          <ImportForm
            {...formProps}
            onSuggestTitle={(suggested) => setTitle((current) => current || suggested)}
          />
        </TabsContent>
        <TabsContent value="audio" className="pt-4">
          <AudioForm {...formProps} />
        </TabsContent>
        <TabsContent value="transcript" className="pt-4">
          <TranscriptForm {...formProps} />
        </TabsContent>
      </Tabs>
      {!ready && (
        <p className="text-muted-foreground text-sm">To continue, {missing.join(', ')}.</p>
      )}
    </div>
  )
}
