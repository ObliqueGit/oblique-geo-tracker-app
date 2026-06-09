-- ============================================================
-- Migration 004: Switch platform from perplexity → claude
-- Run in Supabase SQL editor after 001, 002, 003
-- ============================================================

-- Update any existing audit_results rows that reference 'perplexity'
UPDATE public.audit_results SET platform = 'claude' WHERE platform = 'perplexity';

-- Update any existing visibility_scores rows
UPDATE public.visibility_scores SET platform = 'claude' WHERE platform = 'perplexity';

-- Update any existing prompts that include 'perplexity' in their platforms array
UPDATE public.prompts
SET platforms = array_replace(platforms, 'perplexity', 'claude')
WHERE 'perplexity' = ANY(platforms);

-- If there is a CHECK constraint on platform column in audit_results, drop and recreate it
-- (Supabase may or may not have one depending on how 001 was written)
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_results'
    AND constraint_name = 'audit_results_platform_check'
  ) THEN
    ALTER TABLE public.audit_results DROP CONSTRAINT audit_results_platform_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'visibility_scores'
    AND constraint_name = 'visibility_scores_platform_check'
  ) THEN
    ALTER TABLE public.visibility_scores DROP CONSTRAINT visibility_scores_platform_check;
  END IF;
END $$;

-- Add updated constraints
ALTER TABLE public.audit_results
  ADD CONSTRAINT audit_results_platform_check
  CHECK (platform IN ('chatgpt', 'gemini', 'claude'));

ALTER TABLE public.visibility_scores
  ADD CONSTRAINT visibility_scores_platform_check
  CHECK (platform IN ('chatgpt', 'gemini', 'claude', 'overall'));
