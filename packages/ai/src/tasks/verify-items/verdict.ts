import type {
  ItemVerification,
  McqAnswerKey,
  SpotFlawAnswerKey,
  TransferAnswerKey,
} from '@lectheo/contracts'
import type { ItemSolution, VerifyItem } from './schema'

type AnswerKey = McqAnswerKey | SpotFlawAnswerKey | TransferAnswerKey

function answerMatches(item: VerifyItem, key: AnswerKey, s: ItemSolution): boolean {
  if (item.kind === 'diagnostic_mcq' && 'correctOptionId' in key) {
    return s.solvedAnswer.trim() === key.correctOptionId
  }
  if (item.kind === 'spot_flaw' && 'hasFlaw' in key) {
    const verdictOk = (s.solvedAnswer.trim() === 'flawed') === key.hasFlaw
    return verdictOk && (!key.hasFlaw || s.flawSentenceIdx === key.flawSentenceIdx)
  }
  // ponytail: transfer answers are free text; we trust the checks instead of matching.
  return item.kind === 'transfer'
}

/**
 * Compares the blind solution with the stored key (Architecture §5.3): verified only if the
 * answer matches and every check passes. Returns the `items.verification` jsonb.
 */
export function toVerification(
  item: VerifyItem,
  key: AnswerKey,
  solution: ItemSolution,
  model: string,
): ItemVerification {
  const matches = answerMatches(item, key, solution)
  const checksPass = solution.singleAnswer && solution.citationsSupport && solution.unambiguous
  const reasons = [
    ...(matches ? [] : ['verifier answer differs from the key']),
    ...solution.reasons,
  ]
  return {
    verdict: matches && checksPass ? 'pass' : 'fail',
    solvedAnswer: solution.solvedAnswer,
    reasons,
    model,
  }
}
