import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineStreamTask } from '../../stream-task'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import type { FriendReplyInput } from './schema'

export type { FriendReplyInput } from './schema'

const FAKE_QUESTIONS = [
  'Wait, so what does the pointer actually hold — the value or something else?',
  'Okay! But why would C need malloc if it already has variables?',
  'Hmm, what happens if I forget to call free?',
  'Is that why valgrind complains about leaks?',
] as const

/** Teach-back confused friend (Sonnet 5.5 low, streamed). Use with `streamPersona()`. */
export const friendReplyTask = defineStreamTask<FriendReplyInput>({
  name: 'friend-reply',
  role: 'persona',
  promptVersion: PROMPT_VERSION,
  buildPrompt,
  maxOutputTokens: MAX_OUTPUT_TOKENS.persona,
  fakeText: (input) =>
    input.turn >= input.maxTurns
      ? `Thanks, I think I finally get ${input.conceptName} now!`
      : (FAKE_QUESTIONS[(input.turn - 1 + FAKE_QUESTIONS.length) % FAKE_QUESTIONS.length] ??
        'Can you say that another way?'),
})
