import type { AuditResult, Platform, VisibilityScore } from '@/lib/types'

type PartialScore = Omit<VisibilityScore, 'id' | 'created_at'>

/**
 * Calculate visibility scores from completed audit results.
 *
 * Core score = (prompts where brand mentioned / total prompts run) × 100
 * This is the only metric we guarantee — derived directly from raw API responses,
 * no synthetic inflation.
 *
 * Additional derived metrics:
 * - ranked_count   = prompts where brand was mentioned and rank ≤ 3
 * - outranked_count = prompts where brand was mentioned but rank ≥ 4
 * - absent_count   = prompts where brand was not mentioned
 * - sir_score      = (cited_count / total_prompts) × 100 (Summarization Inclusion Rate)
 * - nss            = (positive − negative) / total_with_sentiment × 100 (Net Sentiment Score)
 */
export function calculateScores(
  auditId: string,
  clientId: string,
  results: AuditResult[]
): PartialScore[] {
  const platforms: Platform[] = ['chatgpt', 'gemini', 'claude']
  const scores: PartialScore[] = []

  for (const platform of platforms) {
    const platformResults = results.filter((r) => r.platform === platform)
    if (platformResults.length === 0) continue

    const mentions = platformResults.filter((r) => r.brand_mentioned)
    const ranks = mentions
      .map((r) => r.brand_rank)
      .filter((rank): rank is number => rank !== null)

    const avg_rank = ranks.length > 0
      ? ranks.reduce((sum, r) => sum + r, 0) / ranks.length
      : null

    // Ranked / outranked / absent counts
    const ranked_count   = platformResults.filter((r) => r.mention_status === 'ranked').length
    const outranked_count = platformResults.filter((r) => r.mention_status === 'outranked').length
    const absent_count   = platformResults.filter((r) => r.mention_status === 'absent').length

    // SIR: how many responses cited the client's own domain as a source
    const cited_count = platformResults.filter((r) => r.is_source_cited).length
    const sir_score = platformResults.length > 0
      ? parseFloat(((cited_count / platformResults.length) * 100).toFixed(1))
      : null

    // NSS: Net Sentiment Score across all results with a sentiment value
    const sentimentResults = platformResults.filter((r) => r.sentiment !== null)
    let nss: number | null = null
    if (sentimentResults.length > 0) {
      const pos = sentimentResults.filter((r) => r.sentiment === 'positive').length
      const neg = sentimentResults.filter((r) => r.sentiment === 'negative').length
      nss = parseFloat((((pos - neg) / sentimentResults.length) * 100).toFixed(1))
    }

    scores.push({
      audit_id: auditId,
      client_id: clientId,
      platform,
      score: (mentions.length / platformResults.length) * 100,
      mentions_count: mentions.length,
      total_prompts: platformResults.length,
      ranked_count,
      outranked_count,
      absent_count,
      avg_rank: avg_rank !== null ? parseFloat(avg_rank.toFixed(2)) : null,
      sir_score,
      nss,
    })
  }

  // Overall score = aggregated across all platforms
  if (scores.length > 0) {
    const totalMentions    = scores.reduce((s, p) => s + p.mentions_count, 0)
    const totalPrompts     = scores.reduce((s, p) => s + p.total_prompts, 0)
    const totalRanked      = scores.reduce((s, p) => s + p.ranked_count, 0)
    const totalOutranked   = scores.reduce((s, p) => s + p.outranked_count, 0)
    const totalAbsent      = scores.reduce((s, p) => s + p.absent_count, 0)

    const rankedScores = scores.filter((s) => s.avg_rank !== null)
    const overallAvgRank =
      rankedScores.length > 0
        ? rankedScores.reduce((s, p) => s + p.avg_rank!, 0) / rankedScores.length
        : null

    // SIR overall = mean of platform SIRs (only for platforms with data)
    const sirScores = scores.filter((s) => s.sir_score !== null)
    const overallSIR = sirScores.length > 0
      ? parseFloat((sirScores.reduce((s, p) => s + p.sir_score!, 0) / sirScores.length).toFixed(1))
      : null

    // NSS overall = mean of platform NSS values
    const nssScores = scores.filter((s) => s.nss !== null)
    const overallNSS = nssScores.length > 0
      ? parseFloat((nssScores.reduce((s, p) => s + p.nss!, 0) / nssScores.length).toFixed(1))
      : null

    scores.push({
      audit_id: auditId,
      client_id: clientId,
      platform: 'overall',
      score: totalPrompts > 0 ? (totalMentions / totalPrompts) * 100 : 0,
      mentions_count: totalMentions,
      total_prompts: totalPrompts,
      ranked_count: totalRanked,
      outranked_count: totalOutranked,
      absent_count: totalAbsent,
      avg_rank: overallAvgRank !== null ? parseFloat(overallAvgRank.toFixed(2)) : null,
      sir_score: overallSIR,
      nss: overallNSS,
    })
  }

  return scores
}
