import type { LanguageModelUsage, ProviderMetadata } from 'ai'

export interface UsageTotals {
  readonly inputTokens: number
  readonly cachedTokens: number
  readonly outputTokens: number
  readonly costUsd: number | null
}

export const ZERO_USAGE: UsageTotals = {
  inputTokens: 0,
  cachedTokens: 0,
  outputTokens: 0,
  costUsd: null,
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * AI Gateway reports spend in `providerMetadata.gateway.cost` (a decimal string, USD).
 * `marketCost` is the list-price equivalent; used only when `cost` is absent.
 */
export function gatewayCost(metadata: ProviderMetadata | undefined): number | null {
  const gw = metadata?.['gateway']
  if (!gw || typeof gw !== 'object') return null
  return toNumber(gw['cost']) ?? toNumber(gw['marketCost'])
}

type UsageLike = Pick<LanguageModelUsage, 'inputTokens' | 'outputTokens'> & {
  readonly inputTokenDetails?: { readonly cacheReadTokens?: number | undefined }
  readonly outputTokenDetails?: {
    readonly textTokens?: number | undefined
    readonly reasoningTokens?: number | undefined
  }
}

export function usageFrom(
  usage: UsageLike | undefined,
  metadata: ProviderMetadata | undefined,
): UsageTotals {
  const details = usage?.outputTokenDetails
  const output = usage?.outputTokens ?? (details?.textTokens ?? 0) + (details?.reasoningTokens ?? 0)
  return {
    inputTokens: usage?.inputTokens ?? 0,
    cachedTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: output,
    costUsd: gatewayCost(metadata),
  }
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  const cost = a.costUsd === null && b.costUsd === null ? null : (a.costUsd ?? 0) + (b.costUsd ?? 0)
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: cost,
  }
}
