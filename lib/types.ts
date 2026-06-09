export type Platform = 'chatgpt' | 'gemini' | 'claude'
export type AuditStatus = 'pending' | 'running' | 'complete' | 'failed'
export type Sentiment = 'positive' | 'neutral' | 'negative'
export type PromptCategory = 'brand' | 'category' | 'comparison' | 'local' | 'problem'
export type ReportStatus = 'generating' | 'ready' | 'sent' | 'failed'
export type UserRole = 'admin' | 'staff'
export type MentionStatus = 'ranked' | 'outranked' | 'absent'
// 'ranked'   = brand mentioned, rank ≤ 3 (or competitor-independent appearance)
// 'outranked' = brand mentioned but rank ≥ 4 or a competitor ranks higher
// 'absent'   = brand not mentioned at all

export interface HallucinationFlag {
  claim: string           // verbatim AI sentence containing the suspected claim
  severity: 'warn' | 'alert'  // warn = unverified, alert = likely wrong
  detected_at: string     // ISO timestamp
  platform: Platform
  prompt_text: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  website: string
  industry: string | null
  contact_name: string | null
  contact_email: string | null
  brand_aliases: string[]
  target_keywords: string[]
  monthly_report_enabled: boolean
  report_day: number
  report_recipient_emails: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Competitor {
  id: string
  client_id: string
  name: string
  website: string | null
  brand_aliases: string[]
  created_at: string
}

export interface Prompt {
  id: string
  client_id: string
  text: string
  category: PromptCategory | null
  platforms: Platform[]
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Audit {
  id: string
  client_id: string
  triggered_by: string | null
  trigger_type: 'manual' | 'scheduled'
  status: AuditStatus
  error_message: string | null
  prompts_total: number
  prompts_completed: number
  started_at: string
  completed_at: string | null
}

export interface AuditResult {
  id: string
  audit_id: string
  prompt_id: string
  platform: Platform
  raw_response: string
  brand_mentioned: boolean
  brand_rank: number | null
  mention_status: MentionStatus   // ranked / outranked / absent
  competitor_data: Record<string, number | null> // name → rank or null if not mentioned
  sentiment: Sentiment | null
  // ── new fields ──
  citation_urls: string[]         // URLs the AI cited in this response
  is_source_cited: boolean        // true if client's own domain appears in citation_urls
  hallucination_flags: HallucinationFlag[]  // potential factual errors about the brand
  model_used: string | null
  tokens_used: number | null
  latency_ms: number | null
  created_at: string
}

export interface VisibilityScore {
  id: string
  audit_id: string
  client_id: string
  platform: Platform | 'overall'
  score: number        // 0–100 percentage
  mentions_count: number
  total_prompts: number
  ranked_count: number    // prompts where brand appeared at rank 1–3
  outranked_count: number // prompts where brand appeared at rank 4+
  absent_count: number    // prompts where brand was not mentioned
  avg_rank: number | null
  sir_score: number | null  // Summarization Inclusion Rate: cited_count / total_prompts × 100
  nss: number | null        // Net Sentiment Score: (pos − neg) / total × 100, range −100..+100
  created_at: string
}

export interface Report {
  id: string
  client_id: string
  audit_id: string | null
  report_month: string // ISO date, first of month
  ai_summary: string | null
  pdf_path: string | null
  status: ReportStatus
  email_sent_at: string | null
  generated_at: string
}

// ---- View/Computed types ----

export interface ClientWithLatestScore extends Client {
  latest_audit?: Pick<Audit, 'id' | 'started_at' | 'status'>
  scores?: Record<Platform | 'overall', number>
  score_delta?: number // change from previous audit
}

export interface AuditWithResults extends Audit {
  results: AuditResult[]
  scores: VisibilityScore[]
  prompts: Prompt[]
}

// What the audit engine sends back per prompt×platform
export interface RawQueryResult {
  platform: Platform
  prompt_id: string
  raw_response: string
  model_used: string
  tokens_used: number
  latency_ms: number
}
