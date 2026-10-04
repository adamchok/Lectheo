import {
  friendReplyTask,
  gradedCriteria,
  judgeTeachBackTask,
  keyPointRubric,
  runTask,
  streamPersona,
  type ChatTurn,
} from '@lectheo/ai'
import { RubricSnapshot, type KeyPoints } from '@lectheo/contracts'
import { messages } from '@lectheo/db'
import { teachBackOutcome } from '@lectheo/domain'
import { invalidState } from '../errors'
import { conceptSources } from './sources'
import type { ActivityContext, ActivityTypeHandler, MessageRow } from './types'

/*
 * Teach-back (F4a, Architecture §4.6) — minimal end-to-end handler. The confused friend streams
 * (UI message stream); the judge grades key-point coverage from rubric_snapshot (🔒 never sent).
 */

export const TEACH_BACK_TURN_BUDGET = 6

// ponytail: one persona (F4a.2 Must); the picker (Should) adds entries + prompt variants.
export const PERSONAS = {
  first_year: { key: 'first_year', name: 'Sam, a curious first-year' },
} as const
type PersonaKey = keyof typeof PERSONAS
const DEFAULT_PERSONA: PersonaKey = 'first_year'

const personaOf = (key: string | null) =>
  key && key in PERSONAS ? PERSONAS[key as PersonaKey] : PERSONAS[DEFAULT_PERSONA]

export const openerFor = (conceptName: string): string =>
  `Hey! I missed the lecture on ${conceptName}. Can you explain it to me? Like, what is it ` +
  'and why would anyone need it?'

/** F5.1 hint after the guiding question: how much is missing, never what (F5.3). */
export function retryHintFor(criteria: readonly { score: number; max: number }[]): string | null {
  const open = criteria.filter((c) => c.score < c.max).length
  if (open === 0) return null
  const points = open === 1 ? '1 key point' : `${open} key points`
  return (
    `Sam is still fuzzy on ${points} out of ${criteria.length}. Try walking through one concrete ` +
    'example step by step, and say why each step happens.'
  )
}

function keyPointsOf(ctx: ActivityContext): KeyPoints {
  const snapshot = RubricSnapshot.parse(ctx.activity.rubricSnapshot)
  if (snapshot.kind !== 'key_points') throw new Error('teach_back without a key_points snapshot')
  return snapshot.keyPoints
}

const toTurns = (rows: readonly MessageRow[]): ChatTurn[] =>
  rows.map((m) => ({ role: m.role, text: m.content }))

/** Persona style stripped (Architecture §4.6): only the question sentences, else the whole text. */
export function questionOf(text: string): string {
  const questions = text.match(/[^.!?\n]*\?/g)?.map((q) => q.trim()).filter(Boolean) ?? []
  return questions.length > 0 ? questions.join(' ') : text.trim()
}

/** Friend question (the persona message before it) + the student's answer, in order. */
export function exchangesOf(turns: readonly ChatTurn[]): { question: string; answer: string }[] {
  return turns.flatMap((t, i) => {
    if (t.role !== 'student') return []
    const prev = turns[i - 1]
    return [{ question: prev?.role === 'persona' ? questionOf(prev.text) : '', answer: t.text }]
  })
}

function explanationText(ctx: ActivityContext, keyPoints: KeyPoints): string {
  const points = keyPoints.map((k) => `- ${k.text}`).join('\n')
  return `${ctx.concept.summary}\n\nKey points from the lecture:\n${points}`
}

export const teachBackHandler: ActivityTypeHandler<'teach_back'> = {
  type: 'teach_back',
  turnBudget: TEACH_BACK_TURN_BUDGET,
  hintsAvailable: 0,

  async start(ctx) {
    const persona = personaOf(ctx.persona)
    return {
      itemId: null,
      rubricSnapshot: { kind: 'key_points', keyPoints: ctx.concept.keyPoints },
      persona: persona.key,
      initialMessages: [{ role: 'persona', content: openerFor(ctx.concept.name) }],
    }
  },

  async publicStart(ctx) {
    return {
      persona: { ...personaOf(ctx.activity.persona) },
      opener: openerFor(ctx.concept.name),
      turnBudget: ctx.activity.turnBudget,
    }
  },

  async reply(ctx, { turnsLeft }) {
    const history = toTurns(await ctx.visibleMessages())
    const result = await streamPersona(
      friendReplyTask,
      {
        conceptName: ctx.concept.name,
        conceptSummary: ctx.concept.summary,
        history,
        turn: ctx.activity.turnsUsed,
        maxTurns: ctx.activity.turnBudget,
      },
      ctx.ai,
    )
    // Keep generating (and persist) even if the client disconnects mid-stream.
    void result.consumeStream()
    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) =>
        part.type === 'start' || part.type === 'finish' ? { turnsLeft } : undefined,
      onEnd: async () => {
        const text = (await result.text).trim()
        if (!text) return
        await ctx.db
          .insert(messages)
          .values({ activityId: ctx.activity.id, role: 'persona', content: text })
      },
    })
  },

  async submit(ctx) {
    const keyPoints = keyPointsOf(ctx)
    const exchanges = exchangesOf(toTurns(await ctx.visibleMessages()))
    if (exchanges.length === 0) throw invalidState('Explain the concept to Sam before submitting.')
    const judge = await runTask(
      judgeTeachBackTask,
      { conceptName: ctx.concept.name, keyPoints, exchanges },
      ctx.ai,
    )
    // Labels stay generic: the key-point text is the answer, revealed only by finalReveal (F5.3).
    const criteria = gradedCriteria(judge.output, keyPointRubric({ keyPoints })).map((c, i) => ({
      ...c,
      label: `Key point ${i + 1}`,
    }))
    return {
      checks: null,
      criteria,
      ...teachBackOutcome(criteria),
      feedback: { guidingQuestion: judge.output.guidingQuestion, hint: retryHintFor(criteria) },
      rationale: judge.output.rationale,
      misconceptions: judge.output.misconceptions,
      judgeModel: judge.model,
      sources: await conceptSources(ctx.db, ctx.concept),
    }
  },

  async explanation(ctx) {
    return {
      explanation: explanationText(ctx, keyPointsOf(ctx)),
      sources: await conceptSources(ctx.db, ctx.concept),
    }
  },

  async finalReveal(ctx) {
    const keyPoints = keyPointsOf(ctx)
    return {
      explanation: explanationText(ctx, keyPoints),
      rubric: keyPoints.map((k, i) => ({
        id: k.id,
        label: `Key point ${i + 1}`,
        description: k.text,
      })),
    }
  },
}
