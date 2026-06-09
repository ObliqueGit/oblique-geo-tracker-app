import { createServiceClient } from '@/lib/supabase/server'
import type { Platform, PromptCategory } from '@/lib/types'

export interface CompetitorInput {
  name: string
  website?: string | null
  brand_aliases?: string[]
}

export interface PromptInput {
  text: string
  category?: PromptCategory | null
  platforms?: Platform[]
}

export interface ClientPayload {
  name: string
  website: string
  industry?: string | null
  contact_name?: string | null
  contact_email?: string | null
  brand_aliases?: string[]
  target_keywords?: string[]
  monthly_report_enabled?: boolean
  report_day?: number
  report_recipient_emails?: string[]
  is_active?: boolean
  competitors?: CompetitorInput[]
  prompts?: PromptInput[]
}

export const ALL_PLATFORMS: Platform[] = ['chatgpt', 'gemini', 'claude']

type Db = ReturnType<typeof createServiceClient>

export async function replaceCompetitors(db: Db, clientId: string, competitors: CompetitorInput[]) {
  // Competitors are pure config (no inbound FK) — safe to fully replace.
  await db.from('competitors').delete().eq('client_id', clientId)
  const rows = competitors
    .filter((c) => c.name?.trim())
    .map((c) => ({
      client_id: clientId,
      name: c.name.trim(),
      website: c.website?.trim() || null,
      brand_aliases: c.brand_aliases ?? [],
    }))
  if (rows.length > 0) await db.from('competitors').insert(rows)
}

export async function replacePrompts(db: Db, clientId: string, prompts: PromptInput[]) {
  const rows = prompts
    .filter((p) => p.text?.trim())
    .map((p, i) => ({
      client_id: clientId,
      text: p.text.trim(),
      category: p.category ?? null,
      platforms: p.platforms?.length ? p.platforms : ALL_PLATFORMS,
      sort_order: i,
      is_active: true,
    }))
  if (rows.length > 0) await db.from('prompts').insert(rows)
}
