import type { Sentiment, MentionStatus, HallucinationFlag } from '@/lib/types'
import type { Platform } from '@/lib/types'

interface ParsedMention {
  mentioned: boolean
  rank: number | null  // ordinal position of first entity name in response, null = not found
  sentiment: Sentiment | null
  mention_status: MentionStatus
}

/**
 * Detect whether a brand appears in an AI response and, if so, at what ordinal
 * rank among all named entities in that response.
 *
 * "Rank" here means: counting distinct named entities as they appear in the text,
 * what position does this brand occupy? e.g. if the response lists "Agency A, Agency B,
 * Oblique, Agency C" then Oblique's rank = 3.
 *
 * This is an approximation — we identify entities by extracting noun-like tokens
 * around capitalised words and bullet/numbered list items. Accurate NER would
 * require a dedicated model call; this heuristic avoids extra API cost while
 * being transparent about its limitations.
 */
export function parseBrandMention(
  rawResponse: string,
  brandName: string,
  brandAliases: string[]
): ParsedMention {
  const allNames = [brandName, ...brandAliases].filter(Boolean)
  const normalised = rawResponse.toLowerCase()

  // Check if any alias appears in the response
  const mentioned = allNames.some((name) =>
    normalised.includes(name.toLowerCase())
  )

  if (!mentioned) {
    return { mentioned: false, rank: null, sentiment: null, mention_status: 'absent' }
  }

  // Find ordinal rank by splitting response into candidate "entities"
  // Strategy: extract all title-cased words/phrases from bullet/numbered list items first,
  // then fall back to inline title-cased noun phrases.
  const rank = estimateRank(rawResponse, allNames)
  const sentiment = estimateSentiment(rawResponse, allNames)

  // Determine mention status:
  // ranked   = rank 1–3 (or rank unknown but mentioned)
  // outranked = rank 4+
  const mention_status: MentionStatus = (rank !== null && rank >= 4) ? 'outranked' : 'ranked'

  return { mentioned, rank, sentiment, mention_status }
}

/**
 * Parse all tracked competitors from the response.
 * Returns a map of competitor name → rank (or null if not mentioned).
 */
export function parseCompetitorMentions(
  rawResponse: string,
  competitors: Array<{ name: string; brand_aliases: string[] }>
): Record<string, number | null> {
  const result: Record<string, number | null> = {}
  for (const comp of competitors) {
    const allNames = [comp.name, ...comp.brand_aliases].filter(Boolean)
    const normalised = rawResponse.toLowerCase()
    const mentioned = allNames.some((n) => normalised.includes(n.toLowerCase()))
    result[comp.name] = mentioned ? estimateRank(rawResponse, allNames) : null
  }
  return result
}

// ---- Internal helpers ----

function estimateRank(text: string, targetNames: string[]): number | null {
  // Extract candidate entity tokens in order of appearance
  const entityPattern = /(?:^|\n)\s*(?:\d+\.|[-•*])\s*([A-Z][^\n]{1,60})/g
  const candidates: string[] = []
  let match: RegExpExecArray | null

  while ((match = entityPattern.exec(text)) !== null) {
    candidates.push(match[1].trim())
  }

  // If no list items found, fall back to sentence-level entity extraction
  if (candidates.length === 0) {
    const sentencePattern = /[A-Z][a-zA-Z\s&']{2,40}(?=[\s,.])/g
    let m: RegExpExecArray | null
    while ((m = sentencePattern.exec(text)) !== null) {
      const token = m[0].trim()
      if (token.split(' ').length <= 5) candidates.push(token)
    }
  }

  // Find first candidate that matches a target name
  for (let i = 0; i < candidates.length; i++) {
    const candidateLower = candidates[i].toLowerCase()
    if (targetNames.some((n) => candidateLower.includes(n.toLowerCase()))) {
      return i + 1 // 1-based
    }
  }

  // Fallback: brand is mentioned somewhere in free text — rank by character position
  // relative to other detected entities.
  return null
}

// ── New exported helpers ──────────────────────────────────────────────────────

/**
 * Extract all URLs cited in an AI response.
 * Perplexity and Gemini often include markdown links or raw URLs.
 * Returns deduplicated list of domains (no path).
 */
export function extractCitationDomains(rawResponse: string): string[] {
  const urlPattern = /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)/g
  const domains = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = urlPattern.exec(rawResponse)) !== null) {
    // Capture the root domain (e.g. "petico.my" from "https://petico.my/shop/dog-food")
    domains.add(match[1].toLowerCase())
  }
  return Array.from(domains)
}

/**
 * Check whether the client's own domain appears in the cited sources.
 * Used to compute SIR (Summarization Inclusion Rate).
 */
export function isClientDomainCited(citationDomains: string[], clientWebsite: string): boolean {
  // Strip protocol and www from clientWebsite, e.g. "https://www.petico.my" → "petico.my"
  const clean = clientWebsite.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').toLowerCase()
  return citationDomains.some((d) => d === clean || d.endsWith('.' + clean))
}

/**
 * Detect potential hallucinations — AI claims about the brand that look
 * suspiciously specific (founding year, store count, employee count, pricing)
 * but may be fabricated.
 *
 * Returns sentences flagged for human review. This is a heuristic — it does
 * NOT confirm falsity; a human must verify each flag.
 */
export function detectPotentialHallucinations(
  rawResponse: string,
  brandName: string,
  brandAliases: string[],
  platform: Platform,
  promptText: string
): HallucinationFlag[] {
  const allNames = [brandName, ...brandAliases].filter(Boolean)
  const sentences = rawResponse.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  const flags: HallucinationFlag[] = []

  // Patterns that suggest specific, potentially fabricated facts
  const alertPatterns = [
    /\bfounded\s+in\s+\d{4}\b/i,
    /\b\d+\s+(?:physical\s+)?(?:retail\s+)?(?:store|branch|location|outlet)s?\b/i,
    /\b\d+\s+employee/i,
    /\bvalued\s+at\b/i,
    /\bacquired\s+by\b/i,
    /\blisted\s+on\b/i,
  ]
  // Patterns that are unverified but less alarming
  const warnPatterns = [
    /\bfree\s+(?:delivery|shipping)\s+on\s+(?:all|every)\b/i,
    /\bships?\s+(?:island-wide|nationwide|across\s+Malaysia)\b/i,
    /\b24[/-]7\s+(?:support|service|customer\s+service)\b/i,
    /\bhighly\s+rated\b/i,
    /\bnumber\s+one\b/i,
  ]

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    const containsBrand = allNames.some((n) => lower.includes(n.toLowerCase()))
    if (!containsBrand) continue

    for (const pattern of alertPatterns) {
      if (pattern.test(sentence)) {
        flags.push({
          claim: sentence,
          severity: 'alert',
          detected_at: new Date().toISOString(),
          platform,
          prompt_text: promptText,
        })
        break
      }
    }
    for (const pattern of warnPatterns) {
      if (pattern.test(sentence)) {
        flags.push({
          claim: sentence,
          severity: 'warn',
          detected_at: new Date().toISOString(),
          platform,
          prompt_text: promptText,
        })
        break
      }
    }
  }

  return flags
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function estimateSentiment(text: string, targetNames: string[]): Sentiment | null {
  // Find the sentence(s) containing the brand name
  const sentences = text.split(/[.!?]+/)
  const relevantSentences: string[] = []

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    if (targetNames.some((n) => lower.includes(n.toLowerCase()))) {
      relevantSentences.push(sentence)
    }
  }

  if (relevantSentences.length === 0) return 'neutral'

  const context = relevantSentences.join(' ').toLowerCase()

  const positiveTerms = [
    'excellent', 'great', 'top', 'best', 'leading', 'award', 'recommend',
    'renowned', 'trusted', 'strong', 'impressive', 'highly', 'outstanding',
    'reputable', 'experienced', 'specialist', 'expert',
  ]
  const negativeTerms = [
    'poor', 'worst', 'avoid', 'scam', 'unreliable', 'overpriced', 'bad',
    'weak', 'failing', 'outdated', 'mediocre', 'complaint', 'issue',
  ]

  const posScore = positiveTerms.filter((t) => context.includes(t)).length
  const negScore = negativeTerms.filter((t) => context.includes(t)).length

  if (posScore > negScore) return 'positive'
  if (negScore > posScore) return 'negative'
  return 'neutral'
}
