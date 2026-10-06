'use client'

import type { CourseSummary } from '@lectheo/contracts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from './form-parts'

export type CourseChoice = { kind: 'existing'; id: string } | { kind: 'new'; title: string }

const NEW = '__new__'
const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

export interface CoursePickerProps {
  courses: readonly CourseSummary[]
  /** False for sample accounts that already have their one course (API Spec §4). */
  canCreate: boolean
  value: CourseChoice
  onChange: (value: CourseChoice) => void
}

/** Pick one of the student's own courses, or name a new one (created on submit). */
export function CoursePicker({ courses, canCreate, value, onChange }: CoursePickerProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="course">
        Course <RequiredMark />
      </Label>
      {courses.length > 0 && (
        <select
          id="course"
          required
          className={selectClass}
          value={value.kind === 'existing' ? value.id : NEW}
          onChange={(e) =>
            onChange(
              e.target.value === NEW
                ? { kind: 'new', title: '' }
                : { kind: 'existing', id: e.target.value },
            )
          }
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
          {canCreate && <option value={NEW}>New course…</option>}
        </select>
      )}
      {value.kind === 'new' && (
        <Input
          id={courses.length > 0 ? 'new-course' : 'course'}
          aria-label={courses.length > 0 ? 'New course name' : undefined}
          required
          placeholder="e.g. Biology 101"
          maxLength={120}
          value={value.title}
          onChange={(e) => onChange({ kind: 'new', title: e.target.value })}
        />
      )}
      {!canCreate && (
        <p className="text-muted-foreground text-xs">
          Sample accounts have one course. Sign in with Google to add more.
        </p>
      )}
    </div>
  )
}
