import { beforeEach, describe, expect, it } from 'vitest'
import { getNextStep } from './next'
import {
  ACTOR_A,
  ACTOR_B,
  ACTOR_G,
  addAttempt,
  addMarker,
  addSession,
  createFixture,
  type Fixture,
  ID,
} from './test-fixtures'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

const SESSION_2 = '0190a000-0000-7000-8000-0000000b0002'

describe('GET /courses/{id}/next', () => {
  it('404s another user’s personal course and malformed ids', async () => {
    await expect(getNextStep(ACTOR_B, ID.P, f.db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getNextStep(ACTOR_B, 'nope', f.db)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('goes study → diagnostic → activity', async () => {
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toEqual({
      kind: 'study',
      lectureId: ID.L1,
      reason: "Lecture 1 is ready. Study it in a few minutes and mark what's unclear.",
      evidence: [],
      estimateMinutes: 1, // the brief's few short summaries and key points
      payoff: 'Your marks decide what the diagnostic asks.',
      alsoWorthDoing: [],
    })

    await addMarker(f, { lectureId: ID.L1, userId: ID.A })
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'study',
      lectureId: ID.L2,
    })

    await addMarker(f, { lectureId: ID.L2, userId: ID.A })
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'diagnostic',
      lectureId: ID.L1,
    })

    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C3,
      activityType: 'diagnostic',
      confidence: 'unsure',
      outcome: 'incorrect',
    })
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'activity',
      conceptId: ID.C3,
      conceptName: 'Arrays',
      activityType: 'spot_flaw',
    })
  })

  it('ranks a confident mistake first and skips practice types already passed', async () => {
    for (const lectureId of [ID.L1, ID.L2]) await addMarker(f, { lectureId, userId: ID.A })
    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C3,
      activityType: 'diagnostic',
      confidence: 'unsure',
      outcome: 'incorrect',
    })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C2,
      activityType: 'spot_flaw',
      outcome: 'correct',
      minutesAgo: 90,
    })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C2,
      activityType: 'diagnostic',
      confidence: 'sure',
      outcome: 'incorrect',
    })
    const step = await getNextStep(ACTOR_A, ID.LIB, f.db)
    expect(step).toMatchObject({ kind: 'activity', conceptId: ID.C2, activityType: 'teach_back' })
    expect(step.reason).toContain('You were sure about Loops')
  })

  it('without a brief to read, estimates by the part of the video that plays', async () => {
    // L5-like: a 2:03:50 video that plays 1:16:30–2:01:30. No concepts → no reading time.
    await f.exec(`
      DELETE FROM concept_occurrences;
      UPDATE lectures SET duration_ms = 7430000,
        media = '{"youtubeId":"x","startMs":4590000,"endMs":7290000}'::jsonb
      WHERE id = '${ID.L1}';
      UPDATE lectures SET duration_ms = 600000 WHERE id = '${ID.L2}';
    `)
    expect((await getNextStep(ACTOR_A, ID.LIB, f.db)).estimateMinutes).toBe(45)
    await addMarker(f, { lectureId: ID.L1, userId: ID.A })
    // No media window: the recording's own length.
    expect((await getNextStep(ACTOR_A, ID.LIB, f.db)).estimateMinutes).toBe(10)
  })

  it('sends an undiagnosed personal lecture to the diagnostic', async () => {
    expect(await getNextStep(ACTOR_A, ID.P, f.db)).toMatchObject({
      kind: 'diagnostic',
      lectureId: ID.PL1,
      reason: 'Check what stuck from Week 1 with a quick diagnostic.',
    })
    await expect(getNextStep(ACTOR_B, ID.P, f.db)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('backs the diagnostic with the student’s own marks on that lecture', async () => {
    await addMarker(f, { lectureId: ID.PL1, userId: ID.A, kind: 'lost', tMs: 761_000 })
    await addMarker(f, { lectureId: ID.PL1, userId: ID.B, kind: 'important', tMs: 5_000 })
    const step = await getNextStep(ACTOR_A, ID.P, f.db)
    expect(step).toMatchObject({
      kind: 'diagnostic',
      estimateMinutes: 3,
      payoff: "Finds the mistakes you're sure about.",
    })
    expect(step.evidence).toEqual([
      {
        kind: 'marked_lost',
        text: "You marked I'm lost at 12:41 in Week 1",
        source: { lectureId: ID.PL1, tMs: 761_000 },
      },
    ])
  })

  it('explains the top concept and lists the next two as also worth doing', async () => {
    for (const lectureId of [ID.L1, ID.L2]) await addMarker(f, { lectureId, userId: ID.A })
    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    await addMarker(f, { lectureId: ID.L2, userId: ID.A, conceptId: ID.C3, tMs: 65_000 })
    for (const minutesAgo of [90, 80]) {
      await addAttempt(f, {
        userId: ID.A,
        conceptId: ID.C3,
        activityType: 'diagnostic',
        confidence: 'sure',
        outcome: 'incorrect',
        minutesAgo,
      })
    }
    const step = await getNextStep(ACTOR_A, ID.LIB, f.db)
    expect(step).toMatchObject({
      kind: 'activity',
      conceptId: ID.C3,
      estimateMinutes: 5,
      payoff: 'A correct answer here clears the confident mistake.',
    })
    expect(step.evidence.map((e) => e.text)).toEqual([
      'Sure but wrong, twice, in the diagnostic',
      "You marked I'm lost at 1:05 in Lecture 2",
    ])
    // C1 is a prerequisite of red C3; C2 untouched.
    expect(step.alsoWorthDoing.map((c) => c.conceptName)).toEqual(['Types', 'Loops'])
  })

  it('suggests Stump the AI on the concept mastered longest ago when everything is green', async () => {
    for (const lectureId of [ID.L1, ID.L2]) await addMarker(f, { lectureId, userId: ID.A })
    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    const ages = { [ID.C1]: 30, [ID.C2]: 300, [ID.C3]: 60 }
    for (const [conceptId, minutesAgo] of Object.entries(ages)) {
      for (const activityType of ['spot_flaw', 'teach_back']) {
        await addAttempt(f, {
          userId: ID.A,
          conceptId,
          activityType,
          outcome: 'correct',
          minutesAgo,
        })
      }
    }
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'activity',
      conceptId: ID.C2,
      activityType: 'stump',
      reason: 'Everything here is Mastered. Try to stump the AI on Loops.',
      alsoWorthDoing: [],
    })
  })

  describe('a Google account’s own course', () => {
    const COURSE = '0190a000-0000-7000-8000-0000000c0001'
    const LECTURE = '0190a000-0000-7000-8000-0000000c0011'

    beforeEach(async () => {
      await f.exec(`
        INSERT INTO courses (id, kind, owner_id, title)
          VALUES ('${COURSE}', 'personal', '${ID.G}', 'Physics');
      `)
    })

    const addLecture = (status: string) =>
      f.exec(`
        INSERT INTO lectures (id, course_id, title, seq, source, status) VALUES
          ('${LECTURE}', '${COURSE}', 'Week 1', 1, 'import', '${status}');
      `)

    it('asks for the first lecture when the course is empty', async () => {
      expect(await getNextStep(ACTOR_G, COURSE, f.db)).toEqual({
        kind: 'add_lecture',
        reason: 'Add Lecture 1 to keep going.',
        evidence: [],
        estimateMinutes: null,
        payoff: null,
        alsoWorthDoing: [],
      })
    })

    it.each(['processing', 'map_ready'])('shows a %s lecture’s steps', async (status) => {
      await addLecture(status)
      expect(await getNextStep(ACTOR_G, COURSE, f.db)).toMatchObject({
        kind: 'processing',
        lectureId: LECTURE,
        reason: 'Week 1 is being processed.',
        estimateMinutes: null,
      })
    })

    it.each(['draft', 'uploading'])(
      'asks to finish a %s lecture, not to add the next one',
      async (status) => {
        await addLecture(status)
        expect(await getNextStep(ACTOR_G, COURSE, f.db)).toMatchObject({
          kind: 'processing',
          lectureId: LECTURE,
          reason: 'Finish adding Week 1.',
        })
      },
    )

    it('points at a failed lecture instead of a dead end', async () => {
      await addLecture('failed')
      expect(await getNextStep(ACTOR_G, COURSE, f.db)).toMatchObject({
        kind: 'processing',
        lectureId: LECTURE,
        reason: 'Processing Week 1 stopped. Open it to try again.',
      })
    })

    it('offers the diagnostic once the lecture is ready, then the next lecture', async () => {
      await addLecture('ready')
      expect(await getNextStep(ACTOR_G, COURSE, f.db)).toMatchObject({
        kind: 'diagnostic',
        lectureId: LECTURE,
      })
      await addSession(f, { id: ID.SESSION, userId: ID.G, lectureId: LECTURE, completed: true })
      expect(await getNextStep(ACTOR_G, COURSE, f.db)).toMatchObject({
        kind: 'add_lecture',
        reason: 'Add Lecture 2 to keep going.',
      })
    })
  })
})
