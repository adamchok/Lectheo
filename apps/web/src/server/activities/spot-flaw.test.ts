import { CANNED_DEFLECTION } from '@lectheo/ai'
import { RubricSnapshot } from '@lectheo/contracts'
import { activities, attempts, eq, items, itemSecrets, llmCalls, messages } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from '../db'
import { createActivity, postMessage, takeHint } from './service'
import { effectiveLeakKeywords, GENERIC_CORRECTION, GUIDING_QUESTIONS } from './spot-flaw'
import { submitActivity } from './submit'
import { ALICE, IDS, newId, seedFixture } from './test-fixture'

vi.mock('server-only', () => ({}))

/** Real runTask (AI_FAKE=1); a test can patch the correction judge's fake per-criterion score. */
const ai = vi.hoisted(() => ({ judgeScore: null as number | null }))
vi.mock('@lectheo/ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lectheo/ai')>()
  return {
    ...mod,
    runTask: (task: { name: string; fake: (i: never) => unknown }, input: never, ctx: never) => {
      const score = task.name === 'judge-correction' ? ai.judgeScore : null
      const patched =
        score === null
          ? task
          : {
              ...task,
              fake: (i: never) => {
                const out = task.fake(i) as { criteria: { score: number }[] }
                return { ...out, criteria: out.criteria.map((c) => ({ ...c, score })) }
              },
            }
      return mod.runTask(patched as never, input, ctx)
    },
  }
})

let db: DbLike

beforeEach(async () => {
  db = await seedFixture()
  ai.judgeScore = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

/** First spot_flaw activity of a user → flawed item (flaw in sentence 2); second → no-flaw. */
const start = () =>
  createActivity(ALICE, { id: newId(), conceptId: IDS.concept, type: 'spot_flaw' }, db)
const judgeCalls = async () =>
  (await db.select().from(llmCalls)).filter((c) => c.task === 'judge-correction').length
const setKeywords = (itemId: string, leakKeywords: string[]) =>
  db.update(itemSecrets).set({ leakKeywords }).where(eq(itemSecrets.itemId, itemId))

describe('spot_flaw handler', () => {
  it('freezes a rubric built from the answer key when the item has none', async () => {
    await db.update(itemSecrets).set({ rubric: null }).where(eq(itemSecrets.itemId, IDS.flawed))
    const { id } = await start()
    const [row] = await db.select().from(activities).where(eq(activities.id, id))
    const snapshot = RubricSnapshot.parse(row?.rubricSnapshot)
    if (snapshot.kind !== 'item') throw new Error('expected an item rubric')
    expect(snapshot.rubric.criteria).toHaveLength(1)
    expect(snapshot.rubric.criteria[0]?.description).toContain('Collisions are always possible')
  })

  it('a blank correction scores 0 for it without calling the judge', async () => {
    const { id } = await start()
    const res = await submitActivity(ALICE, id, { verdict: 'flawed', flawSentenceIdx: 2 }, db)
    expect(await judgeCalls()).toBe(0)
    expect(res).toMatchObject({ score: 4, outcome: 'partial' })
    expect(res.criteria.every((c) => c.score === 0)).toBe(true)
    expect(res.feedback.guidingQuestion).toBe(GUIDING_QUESTIONS.noCorrection)
  })

  it('wrong sentence: no judge, correction 0, and no rubric label before the final reveal', async () => {
    const { id } = await start()
    const body = { verdict: 'flawed', flawSentenceIdx: 0, correction: 'It should say O(n).' }
    const res = await submitActivity(ALICE, id, body, db)
    expect(await judgeCalls()).toBe(0)
    expect(res).toMatchObject({ score: 2, outcome: 'incorrect', final: false })
    expect(res.criteria).toEqual([GENERIC_CORRECTION])
    expect(res.feedback.guidingQuestion).toBe(GUIDING_QUESTIONS.location)
    const rubricLabel = 'Correction is right' // the fixture rubric's label
    expect(JSON.stringify(res)).not.toContain(rubricLabel)

    const missed = await submitActivity(ALICE, id, { verdict: 'correct' }, db)
    expect(missed.final).toBe(true)
    expect(JSON.stringify(missed.rubric)).toContain(rubricLabel)
  })

  it('a partial correction (judge ran, not final) shows no rubric label before the reveal', async () => {
    ai.judgeScore = 0
    const { id } = await start()
    const body = { verdict: 'flawed', flawSentenceIdx: 2, correction: 'They can happen.' }
    const res = await submitActivity(ALICE, id, body, db)
    expect(await judgeCalls()).toBe(1)
    expect(res).toMatchObject({ final: false, outcome: 'partial' })
    expect(res.criteria).toEqual([{ id: 'correction', label: 'Criterion 1', score: 0, max: 2 }])
    expect(JSON.stringify(res)).not.toContain('Correction is right')
  })

  it('a wrong verdict on a flawed item shows only the generic correction row', async () => {
    const { id } = await start()
    const res = await submitActivity(ALICE, id, { verdict: 'correct' }, db)
    expect(res.criteria).toEqual([GENERIC_CORRECTION])
  })

  it('drops a judge question that contains a leak keyword', async () => {
    await setKeywords(IDS.flawed, ['concrete case'])
    const { id } = await start()
    const body = { verdict: 'flawed', flawSentenceIdx: 2, correction: 'They can still happen.' }
    await submitActivity(ALICE, id, body, db)
    expect(await judgeCalls()).toBe(1)
    // The fake judge grades it correct (final), so read the question stored with the attempt.
    const [attempt] = await db.select().from(attempts).where(eq(attempts.activityId, id))
    expect(attempt?.grading.guidingQuestion).toBe(GUIDING_QUESTIONS.testCorrection)
  })

  it('right sentence → the judge guiding question', async () => {
    const { id } = await start()
    const body = { verdict: 'flawed', flawSentenceIdx: 2, correction: 'They can still happen.' }
    const res = await submitActivity(ALICE, id, body, db)
    expect(await judgeCalls()).toBe(1)
    expect(Object.values(GUIDING_QUESTIONS)).not.toContain(res.feedback.guidingQuestion)
  })

  it('picks the question by verdict mistake: missed flaw vs false alarm', async () => {
    const flawed = await start()
    const missed = await submitActivity(ALICE, flawed.id, { verdict: 'correct' }, db)
    expect(missed.feedback.guidingQuestion).toBe(GUIDING_QUESTIONS.missedFlaw)

    const noFlaw = await start()
    const body = { verdict: 'flawed', flawSentenceIdx: 1, correction: 'x' }
    const alarm = await submitActivity(ALICE, noFlaw.id, body, db)
    expect(alarm).toMatchObject({ outcome: 'incorrect', score: 0, maxScore: 2 })
    expect(alarm.feedback.guidingQuestion).toBe(GUIDING_QUESTIONS.falseAlarm)
    expect(await judgeCalls()).toBe(0)
  })

  it('no-flaw scenario: replies pass on keywords only; a keyword hit still deflects', async () => {
    await start()
    const { id } = await start()
    expect(await postMessage(ALICE, id, 'Is it all right?', db)).toMatchObject({ turnsLeft: 5 })
    const [first] = await db.select().from(messages).where(eq(messages.role, 'persona'))
    expect(first).toMatchObject({ visible: true, guard: { regexHit: false, jev: null } })

    await setKeywords(IDS.noFlaw, ['lecture'])
    expect(await postMessage(ALICE, id, 'Why?', db)).toMatchObject({ reply: CANNED_DEFLECTION })
  })

  it('keeps the blocking guard on a visible canned deflection and logs the outcome', async () => {
    const { id } = await start()
    await setKeywords(IDS.flawed, ['lecture'])
    await postMessage(ALICE, id, 'Which one is wrong?', db)
    const rows = await db.select().from(messages).where(eq(messages.activityId, id))
    const canned = rows.find((m) => m.visible && m.content === CANNED_DEFLECTION)
    expect(canned?.guard).toMatchObject({ regexHit: true, regenerated: true })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"outcome":"deflected"'))
  })

  it('ignores leak keywords the scenario already shows', async () => {
    expect(effectiveLeakKeywords(['balanced', 'height n'], ['A balanced tree is fast.'])).toEqual([
      'height n',
    ])
    const { id } = await start()
    await setKeywords(IDS.flawed, ['lecture'])
    const sentences = ['As the lecture said, a hash table maps keys to buckets.', 'b', 'c']
    await db.update(items).set({ publicPayload: { sentences } }).where(eq(items.id, IDS.flawed))
    expect(await postMessage(ALICE, id, 'Why?', db)).not.toMatchObject({
      reply: CANNED_DEFLECTION,
    })
  })

  it('falls back to a generic 2-step ladder when the item has no hints', async () => {
    await db.update(itemSecrets).set({ hints: null }).where(eq(itemSecrets.itemId, IDS.flawed))
    const { id } = await start()
    const h1 = await takeHint(ALICE, id, db)
    const h2 = await takeHint(ALICE, id, db)
    expect(h1.hint).not.toBe(h2.hint)
    expect(h2).toMatchObject({ hintsUsed: 2, hintsLeft: 0 })
  })
})
