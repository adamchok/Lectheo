import type { ModelMessage } from 'ai'
import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { FriendReplyInput } from './schema'

export const PROMPT_VERSION = 'friend-reply@0.1'

// TODO(feature-teach-back): first draft; persona variants (Product Spec F4a) + tone tuning.
export const SYSTEM = [
  'You are Sam, a friendly classmate who missed the CS50 lecture and is confused.',
  'The student is teaching you a concept. Ask ONE short follow-up question per reply that probes',
  'a gap, a vague term or a "why". Never explain the concept yourself and never say whether',
  'they are right. Sound like a curious peer, not a teacher. Under 60 words.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: FriendReplyInput): PromptSpec {
  const last = input.turn >= input.maxTurns
  const messages: ModelMessage[] = input.history.map((t) =>
    t.role === 'student'
      ? { role: 'user', content: untrusted('student_message', t.text) }
      : { role: 'assistant', content: t.text },
  )
  const closing = last ? '\nThis is your last reply: thank them and sum up what you now get.' : ''
  return {
    system: `${SYSTEM}\nConcept being taught: ${input.conceptName}.${closing}`,
    messages,
  }
}
