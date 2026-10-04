import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { countWords } from '../common'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { AUTHOR_REPLY_MAX_WORDS, AuthorReplyOutput, type AuthorReplyInput } from './schema'

/**
 * Spot-the-flaw author persona (Sonnet 5.5 low). JSON, not streamed: the reply must pass
 * `checkLeak()` before display (ADR-009 / ADR-013).
 */
export const authorReplyTask = defineTask<AuthorReplyInput, AuthorReplyOutput>({
  name: 'author-reply',
  role: 'persona',
  promptVersion: PROMPT_VERSION,
  schema: AuthorReplyOutput,
  buildPrompt,
  validate: (out) => {
    const words = countWords(out.reply)
    if (words === 0) return ['reply is empty']
    return words > AUTHOR_REPLY_MAX_WORDS ? [`reply too long (${words} words)`] : []
  },
  maxOutputTokens: MAX_OUTPUT_TOKENS.persona,
  fake: (input) => ({
    reply:
      `I wrote it that way because that's how ${input.conceptName} was explained in lecture. ` +
      'Which part are you unsure about?',
  }),
})
