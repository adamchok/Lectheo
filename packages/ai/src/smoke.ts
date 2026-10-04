/**
 * Day-1 smoke test of every role (Tech Stack §2.1 "newness risk"):
 *   AI_GATEWAY_API_KEY=… pnpm --filter @lectheo/ai smoke
 * Calls each role's primary model once with a tiny prompt (≈ $0.01 total, dev key) and prints
 * model, latency, tokens and gateway cost. Exits 1 if any role fails.
 */
import { gateway } from '@ai-sdk/gateway'
import { experimental_evaluate, generateText } from 'ai'
import { MAX_OUTPUT_TOKENS, ROLES, type Role } from './models'
import { usageFrom } from './usage'

interface SmokeRow {
  readonly role: Role
  readonly model: string
  readonly ok: boolean
  readonly latencyMs: number
  readonly detail: string
}

const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

async function smokeLanguageRole(role: Role): Promise<SmokeRow> {
  const { primary } = ROLES[role]
  const started = Date.now()
  try {
    const r = await generateText({
      model: gateway(primary.model),
      prompt: 'Reply with the single word: pong',
      reasoning: primary.reasoning,
      maxOutputTokens: MAX_OUTPUT_TOKENS.smoke,
      maxRetries: 0,
    })
    const u = usageFrom(r.totalUsage, r.providerMetadata)
    const detail =
      `in=${u.inputTokens} cached=${u.cachedTokens} out=${u.outputTokens} ` +
      `cost=${u.costUsd ?? 'n/a'} text=${JSON.stringify(r.text.slice(0, 20))}`
    return { role, model: primary.model, ok: true, latencyMs: Date.now() - started, detail }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { role, model: primary.model, ok: false, latencyMs: Date.now() - started, detail }
  }
}

async function smokeGuard(): Promise<SmokeRow> {
  const model = ROLES.guard.primary.model
  const started = Date.now()
  try {
    const r = await experimental_evaluate({
      model: gateway.evaluationModel(model),
      state: { reply: 'I think malloc gives you memory on the heap.' },
      questions: {
        mentionsHeap: { type: 'boolean', instructions: 'Does reply mention the heap?' },
      },
      maxRetries: 0,
    })
    const p = r.answers.mentionsHeap.probability.toFixed(2)
    const detail = `p(true)=${p} in=${r.usage.inputTokens ?? 0} out=${r.usage.outputTokens ?? 0}`
    return { role: 'guard', model, ok: true, latencyMs: Date.now() - started, detail }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { role: 'guard', model, ok: false, latencyMs: Date.now() - started, detail }
  }
}

async function main(): Promise<number> {
  if (!process.env['AI_GATEWAY_API_KEY'] && !process.env['VERCEL_OIDC_TOKEN']) {
    out('smoke: AI_GATEWAY_API_KEY is not set (use the dev key). Nothing was called.')
    return 1
  }
  const roles = (Object.keys(ROLES) as Role[]).filter((r) => r !== 'guard')
  const rows = [...(await Promise.all(roles.map(smokeLanguageRole))), await smokeGuard()]
  for (const r of rows) {
    out(
      `${r.ok ? 'OK  ' : 'FAIL'} ${r.role.padEnd(17)} ${r.model.padEnd(30)} ${r.latencyMs}ms ${r.detail}`,
    )
  }
  return rows.every((r) => r.ok) ? 0 : 1
}

process.exitCode = await main()
