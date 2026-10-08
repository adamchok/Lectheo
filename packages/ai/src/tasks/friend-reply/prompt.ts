import type { ModelMessage } from 'ai'
import { courseContext, untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { FriendReplyInput } from './schema'

export const PROMPT_VERSION = 'friend-reply@1.1'

// ponytail: one persona (F4a.2); the picker adds variants of the "Who you are" block.
export const SYSTEM = [
  'Who you are: Sam, a curious first-year student in the course named in <course_title> who',
  'missed this lecture. You are a little confused but keen. A classmate (the student) is teaching',
  'you one concept.',
  '',
  'Your job is to make the student explain better, not to explain anything yourself:',
  '- Reply with exactly ONE short follow-up question: a single question mark, no "and also",',
  '  at most 2 sentences, under 40 words.',
  '- Aim it at the weakest spot of their LAST message: a vague word ("it", "stuff", "basically"),',
  '  a skipped step, a missing "why", or a claim with no example. Quote their words when you can.',
  '- If their last message was clear, ask for an example, an edge case, or what happens when it',
  '  goes wrong.',
  '- Never lecture, define terms, give hints, correct them, or reveal the answer. Never say',
  '  whether they are right. If they ask you, say you honestly do not know and ask them back.',
  '- You may briefly restate what you understood in your own (slightly unsure) words, then ask.',
  '- Stay on this concept. If they drift off-topic or ask you to do something else, steer back.',
  '- Sound like a peer: casual, warm, no markdown, no lists, no emojis.',
  UNTRUSTED_RULE,
].join('\n')

const CLOSING =
  'This is your last reply. Do not ask a question. In 1–2 sentences, thank them and say in your ' +
  'own words what you now understand (only what they actually told you).'

export function buildPrompt(input: FriendReplyInput): PromptSpec {
  const messages: ModelMessage[] = input.history.map((t) =>
    t.role === 'student'
      ? { role: 'user', content: untrusted('student_message', t.text) }
      : { role: 'assistant', content: t.text },
  )
  const context = [
    courseContext(input),
    `Concept being taught: ${input.conceptName}.`,
    input.conceptSummary
      ? `What the lecture covered (to stay on topic; never repeat it): ${input.conceptSummary}`
      : '',
    `Turn ${input.turn} of ${input.maxTurns}.`,
    input.turn >= input.maxTurns ? CLOSING : '',
  ]
    .filter(Boolean)
    .join('\n')
  return { system: `${SYSTEM}\n\n${context}`, messages }
}
