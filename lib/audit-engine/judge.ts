import Anthropic from '@anthropic-ai/sdk'
import type { MentionStatus, Sentiment } from '@/lib/types'

// Cheap, fast model for structured extraction — this is analysis of an
// existing answer, not generation, so Haiku is plenty.
const JUDGE_MODEL = 'claude-haiku-4-5-20251001'

export interface JudgeVerdict {
  mentioned: boolean
  rank: number | null
  sentiment: Sentiment | null
  mention_status: MentionStatus
  competitor_data: Record<string, number | null>
}

/**
 * LLM-as-judge extraction: given an AI platform's answer, determine whether
 * the brand was mentioned, its ordinal position among recommended entities,
 * sentiment toward it, and where each tracked competitor placed.
 *
 * Far more reliable than regex heuristics for rank (handles prose, tables,
 * unordered recommendations) and sentiment (handles negation and context).
 * Throws on any failure — the caller falls back to the regex parser, so an
 * audit never dies because the judge hiccuped.
 */
export async function judgeResponse(
  rawResponse: string,
  promptText: string,
  brandName: string,
  brandAliases: string[],
  competitors: Array<{ name: string; brand_aliases: string[] }>
): Promise<JudgeVerdict> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const competitorList = competitors
    .map((c) => `- ${c.name}${c.brand_aliases?.length ? ` (aliases: ${c.brand_aliases.join(', ')})` : ''}`)
    .join('\n')

  const message = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 600,
    temperature: 0,
    system: `You analyse AI assistant answers for brand visibility tracking. Respond with ONLY a JSON object, no markdown fences, no commentary.`,
    messages: [
      {
        role: 'user',
        content: `THE QUESTION ASKED:
${promptText}

THE AI ANSWER TO ANALYSE:
"""
${rawResponse.slice(0, 6000)}
"""

TARGET BRAND: ${brandName}${brandAliases.length ? ` (aliases: ${brandAliases.join(', ')})` : ''}

TRACKED COMPETITORS:
${competitorList || '(none)'}

Analyse the answer and return JSON with exactly these fields:
{
  "mentioned": boolean — is the target brand genuinely referred to (alias matches must be the brand, not coincidental words)?
  "rank": integer or null — if the answer recommends/lists multiple brands or options, the target brand's ordinal position among them (1 = first/most prominent). null if not mentioned or if the answer discusses only the target brand (no ranking context).
  "sentiment": "positive" | "neutral" | "negative" | null — tone toward the target brand specifically. null if not mentioned.
  "mention_status": "ranked" (mentioned, position 1-3 or clearly recommended), "outranked" (mentioned but position 4+ or clearly behind competitors), or "absent" (not mentioned).
  "competitor_data": object mapping each tracked competitor's exact name to its ordinal position (integer) or null if that competitor is not mentioned. Include every tracked competitor as a key.
}`,
      },
    ],
  })

  const text = message.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()

  // Tolerate accidental fences or prose around the JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Judge returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])

  if (typeof parsed.mentioned !== 'boolean') throw new Error('Judge JSON invalid: mentioned')
  const statusOk = ['ranked', 'outranked', 'absent'].includes(parsed.mention_status)
  if (!statusOk) throw new Error('Judge JSON invalid: mention_status')

  const sentiment: Sentiment | null = ['positive', 'neutral', 'negative'].includes(parsed.sentiment)
    ? parsed.sentiment
    : null

  const rank =
    typeof parsed.rank === 'number' && Number.isFinite(parsed.rank) && parsed.rank >= 1
      ? Math.round(parsed.rank)
      : null

  const competitor_data: Record<string, number | null> = {}
  for (const comp of competitors) {
    const v = parsed.competitor_data?.[comp.name]
    competitor_data[comp.name] =
      typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : null
  }

  return {
    mentioned: parsed.mentioned,
    rank,
    sentiment: parsed.mentioned ? sentiment : null,
    mention_status: parsed.mentioned
      ? (parsed.mention_status === 'absent' ? 'ranked' : parsed.mention_status)
      : 'absent',
    competitor_data,
  }
}
