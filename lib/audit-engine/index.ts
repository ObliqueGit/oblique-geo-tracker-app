/**
 * Audit Engine — orchestrates real API calls across all platforms,
 * stores raw results, and computes visibility scores.
 *
 * All data written here comes directly from live API responses.
 * No scores are fabricated or estimated.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { queryChatGPT } from './openai'
import { queryGemini } from './gemini'
import { queryClaude } from './claude'
import {
  parseBrandMention,
  parseCompetitorMentions,
  extractCitationDomains,
  isClientDomainCited,
  detectPotentialHallucinations,
} from './parser'
import { judgeResponse } from './judge'
import { calculateScores } from './scorer'
import type { Audit, AuditResult, Client, Competitor, Platform, Prompt, RawQueryResult } from '@/lib/types'

const PLATFORM_RUNNERS: Record<Platform, (text: string, id: string) => Promise<RawQueryResult>> = {
  chatgpt: queryChatGPT,
  gemini: queryGemini,
  claude: queryClaude,
}

// Delay between API calls to avoid rate-limiting (ms). Web-grounded queries
// are token-heavy (each pulls in search results), so pace generously.
const INTER_CALL_DELAY = 2500

export async function runAudit(auditId: string): Promise<void> {
  const db = createServiceClient()

  // Mark audit as running
  await db
    .from('audits')
    .update({ status: 'running' })
    .eq('id', auditId)

  try {
    // Load audit + client + prompts + competitors
    const { data: audit, error: auditErr } = await db
      .from('audits')
      .select('*, clients(*)')
      .eq('id', auditId)
      .single()

    if (auditErr || !audit) throw new Error(`Audit not found: ${auditId}`)

    const client = audit.clients as Client

    const { data: prompts } = await db
      .from('prompts')
      .select('*')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const { data: competitors } = await db
      .from('competitors')
      .select('*')
      .eq('client_id', client.id)

    const activePrompts: Prompt[] = prompts ?? []
    const activeCompetitors: Competitor[] = competitors ?? []

    // Count total work units (prompt × platform combinations)
    const totalUnits = activePrompts.reduce(
      (sum, p) => sum + p.platforms.length,
      0
    )

    await db
      .from('audits')
      .update({ prompts_total: totalUnits })
      .eq('id', auditId)

    const allResults: AuditResult[] = []
    let completed = 0

    for (const prompt of activePrompts) {
      for (const platform of prompt.platforms as Platform[]) {
        let rawResult: RawQueryResult

        try {
          rawResult = await withRetry(() => PLATFORM_RUNNERS[platform](prompt.text, prompt.id))
        } catch (err) {
          // Log per-prompt failure but continue — don't abort the whole audit
          console.error(`[audit:${auditId}] ${platform} failed for prompt ${prompt.id}:`, err)
          completed++
          await db.from('audits').update({ prompts_completed: completed }).eq('id', auditId)
          continue
        }

        // Extract mention/rank/sentiment via LLM judge; fall back to the
        // regex heuristics if the judge call fails so the audit never stalls.
        let mentioned: boolean
        let rank: number | null
        let sentiment: ReturnType<typeof parseBrandMention>['sentiment']
        let mention_status: ReturnType<typeof parseBrandMention>['mention_status']
        let competitor_data: Record<string, number | null>

        try {
          const verdict = await judgeResponse(
            rawResult.raw_response,
            prompt.text,
            client.name,
            client.brand_aliases,
            activeCompetitors
          )
          ;({ mentioned, rank, sentiment, mention_status, competitor_data } = verdict)
        } catch (judgeErr) {
          console.error(`[audit:${auditId}] judge failed, using regex fallback:`, judgeErr)
          const parsed = parseBrandMention(rawResult.raw_response, client.name, client.brand_aliases)
          mentioned = parsed.mentioned
          rank = parsed.rank
          sentiment = parsed.sentiment
          mention_status = parsed.mention_status
          competitor_data = parseCompetitorMentions(rawResult.raw_response, activeCompetitors)
        }

        // Citation analysis — prefer the platform's real retrieval citations
        // (web-grounded responses), plus any URLs written in the answer text.
        const citation_urls = extractCitationDomains(
          rawResult.raw_response + '\n' + (rawResult.citations ?? []).join('\n')
        )
        const is_source_cited = isClientDomainCited(citation_urls, client.website)

        // Heuristic hallucination flags — specific brand claims that need human review.
        const hallucination_flags = detectPotentialHallucinations(
          rawResult.raw_response,
          client.name,
          client.brand_aliases,
          platform,
          prompt.text
        )

        const resultRow = {
          audit_id: auditId,
          prompt_id: prompt.id,
          platform,
          raw_response: rawResult.raw_response,
          brand_mentioned: mentioned,
          brand_rank: rank,
          mention_status,
          competitor_data,
          sentiment,
          citation_urls,
          is_source_cited,
          hallucination_flags,
          model_used: rawResult.model_used,
          tokens_used: rawResult.tokens_used,
          latency_ms: rawResult.latency_ms,
        }

        const { data: inserted } = await db
          .from('audit_results')
          .insert(resultRow)
          .select()
          .single()

        if (inserted) allResults.push(inserted as AuditResult)

        completed++
        await db.from('audits').update({ prompts_completed: completed }).eq('id', auditId)

        // Rate-limit courtesy delay
        await sleep(INTER_CALL_DELAY)
      }
    }

    // Calculate and store visibility scores
    const scores = calculateScores(auditId, client.id, allResults)
    if (scores.length > 0) {
      await db.from('visibility_scores').insert(scores)
    }

    // Mark audit complete
    await db
      .from('audits')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', auditId)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[audit:${auditId}] Fatal error:`, message)

    await db
      .from('audits')
      .update({ status: 'failed', error_message: message })
      .eq('id', auditId)

    throw err
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Retry with backoff — keeps transient API blips from shrinking a platform's
// denominator and silently skewing its score. Rate limits (429) get a long
// wait because per-minute token windows need real time to reset.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        const msg = err instanceof Error ? err.message : String(err)
        const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit')
        await sleep(isRateLimit ? 30000 * (i + 1) : 3000 * (i + 1))
      }
    }
  }
  throw lastErr
}
