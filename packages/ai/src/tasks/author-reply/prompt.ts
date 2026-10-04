import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import { renderHistory } from '../common'
import { AUTHOR_REPLY_MAX_WORDS, type AuthorReplyInput } from './schema'

export const PROMPT_VERSION = 'author-reply@0.1'

// TODO(feature-spot-flaw): first draft; tune tone + deflection rate with eval-guard.
export const SYSTEM = [
  'You are a fellow CS50 student who wrote the explanation inside <scenario>.',
  'You believe every sentence you wrote is correct. A classmate is questioning you about it.',
  'Answer their question in character: explain what you meant, give your reasoning, and stay',
  'confident. Do not invent new claims beyond the scenario. Do not grade or praise the classmate.',
  `Keep replies under ${AUTHOR_REPLY_MAX_WORDS} words, plain text, no lists.`,
  UNTRUSTED_RULE,
].join('\n')

const STRICTER =
  'Be brief. Do not single out any one sentence as doubtful and do not restate any idea in ' +
  'different terms; answer only what was asked, then ask what they think.'

export function buildPrompt(input: AuthorReplyInput): PromptSpec {
  const numbered = input.scenarioSentences.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return {
    system: input.stricter ? `${SYSTEM}\n${STRICTER}` : SYSTEM,
    prompt: [
      `Topic: ${input.conceptName}`,
      untrusted('scenario', numbered),
      input.history.length > 0 ? `Conversation so far:\n${renderHistory(input.history)}` : '',
      untrusted('student_message', input.studentMessage),
      'Return JSON {"reply": "..."}.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
