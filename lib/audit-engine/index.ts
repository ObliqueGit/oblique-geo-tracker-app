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
import { calculateScores } from './scorer'
import type { Audit, AuditResult, Client, Competitor, Platform, Prompt, RawQueryResult } from '@/lib/types'

const PLATFORM_RUNNERS: Record<Platform, (text: string, id: string) => Promise<RawQueryResult>> = {
  chatgpt: queryChatGPT,
  gemini: queryGemini,
  claude: queryClaude,
}

// Delay between API calls to avoid rate-limiting (ms)
const INTER_CALL_DELAY = 500

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
          rawResult = await PLATFORM_RUNNERS[platform](prompt.text, prompt.id)
        } catch (err) {
          // Log per-prompt failure but continue — don't abort the whole audit
          console.error(`[audit:${auditId}] ${platform} failed for prompt ${prompt.id}:`, err)
          completed++
          await db.from('audits').update({ prompts_completed: completed }).eq('id', auditId)
          continue
        }

        // Parse brand mention from raw response
        const { mentioned, rank, sentiment, mention_status } = parseBrandMention(
          rawResult.raw_response,
          client.name,
          client.brand_aliases
        )

        // Parse competitor mentions
        const competitor_data = parseCompetitorMentions(
          rawResult.raw_response,
          activeCompetitors
        )

        // Citation analysis — which domains the AI cited, and whether the
        // client's own domain is among them (drives the SIR metric).
        const citation_urls = extractCitationDomains(rawResult.raw_response)
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
