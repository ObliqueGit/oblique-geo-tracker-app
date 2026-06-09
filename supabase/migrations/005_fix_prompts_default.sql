-- ============================================================
-- Migration 005: Fix prompts.platforms default
-- Migration 001 defaulted new prompts to include 'perplexity',
-- which violates the 004 check constraint (chatgpt|gemini|claude).
-- This updates the column default so prompts created without an
-- explicit platforms array are valid.
-- Run in Supabase SQL editor after 004.
-- ============================================================

ALTER TABLE public.prompts
  ALTER COLUMN platforms SET DEFAULT ARRAY['chatgpt', 'gemini', 'claude'];

-- Repair any rows still carrying the old default
UPDATE public.prompts
SET platforms = array_replace(platforms, 'perplexity', 'claude')
WHERE 'perplexity' = ANY(platforms);
