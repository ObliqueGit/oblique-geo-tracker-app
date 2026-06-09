-- ============================================================
-- Migration 003: New GEO metrics
-- Adds citation tracking, hallucination flags, SIR, NSS,
-- and the ranked/outranked/absent breakdown to audit_results
-- and visibility_scores.
-- Run in Supabase SQL editor after 001 and 002.
-- ============================================================

-- ── audit_results: new columns ────────────────────────────────────────────────

-- mention_status: 'ranked' | 'outranked' | 'absent'
-- ranked   = brand appeared at position 1–3
-- outranked = brand appeared at position 4+
-- absent   = brand not mentioned
ALTER TABLE public.audit_results
  ADD COLUMN IF NOT EXISTS mention_status TEXT
    CHECK (mention_status IN ('ranked','outranked','absent'))
    NOT NULL DEFAULT 'absent';

-- citation_urls: domains the AI cited as sources in this response
ALTER TABLE public.audit_results
  ADD COLUMN IF NOT EXISTS citation_urls TEXT[] NOT NULL DEFAULT '{}';

-- is_source_cited: true if the client's own domain appears in citation_urls
ALTER TABLE public.audit_results
  ADD COLUMN IF NOT EXISTS is_source_cited BOOLEAN NOT NULL DEFAULT FALSE;

-- hallucination_flags: JSON array of { claim, severity, detected_at, platform, prompt_text }
-- Heuristically detected sentences that may contain fabricated brand facts.
ALTER TABLE public.audit_results
  ADD COLUMN IF NOT EXISTS hallucination_flags JSONB NOT NULL DEFAULT '[]';

-- ── visibility_scores: new columns ───────────────────────────────────────────

-- Ranked / outranked / absent counts
ALTER TABLE public.visibility_scores
  ADD COLUMN IF NOT EXISTS ranked_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.visibility_scores
  ADD COLUMN IF NOT EXISTS outranked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.visibility_scores
  ADD COLUMN IF NOT EXISTS absent_count    INTEGER NOT NULL DEFAULT 0;

-- SIR: Summarization Inclusion Rate (0–100), null if no data
ALTER TABLE public.visibility_scores
  ADD COLUMN IF NOT EXISTS sir_score NUMERIC(5,2);

-- NSS: Net Sentiment Score (−100..+100), null if no sentiment data
ALTER TABLE public.visibility_scores
  ADD COLUMN IF NOT EXISTS nss NUMERIC(6,2);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_results_mention_status
  ON public.audit_results (audit_id, mention_status);

CREATE INDEX IF NOT EXISTS idx_audit_results_is_source_cited
  ON public.audit_results (audit_id, is_source_cited);

-- ── Backfill existing rows ────────────────────────────────────────────────────
-- Set mention_status based on existing brand_mentioned + brand_rank data

UPDATE public.audit_results
SET mention_status = CASE
  WHEN brand_mentioned = FALSE THEN 'absent'
  WHEN brand_rank IS NOT NULL AND brand_rank >= 4 THEN 'outranked'
  ELSE 'ranked'
END
WHERE mention_status = 'absent';  -- only touch rows not yet updated
