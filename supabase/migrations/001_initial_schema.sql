-- ============================================================
-- Oblique GEO Tracker — Initial Schema
-- ============================================================

-- Staff profiles (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clients
CREATE TABLE public.clients (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  website                  TEXT NOT NULL,
  industry                 TEXT,
  contact_name             TEXT,
  contact_email            TEXT,
  -- Brand detection config
  brand_aliases            TEXT[] NOT NULL DEFAULT '{}', -- alt names, common abbreviations
  target_keywords          TEXT[] NOT NULL DEFAULT '{}', -- tracked keyword themes
  -- Report settings
  monthly_report_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  report_day               SMALLINT NOT NULL DEFAULT 1 CHECK (report_day BETWEEN 1 AND 28),
  report_recipient_emails  TEXT[] NOT NULL DEFAULT '{}',
  -- Status
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Competitors tracked per client
CREATE TABLE public.competitors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  website        TEXT,
  brand_aliases  TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prompts tracked per client (the actual AI questions)
CREATE TABLE public.prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  category    TEXT CHECK (category IN ('brand', 'category', 'comparison', 'local', 'problem')),
  -- which platforms this prompt runs on
  platforms   TEXT[] NOT NULL DEFAULT ARRAY['chatgpt', 'gemini', 'perplexity'],
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit runs (one per client per trigger)
CREATE TABLE public.audits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  triggered_by       UUID REFERENCES public.profiles(id),
  trigger_type       TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'scheduled')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  error_message      TEXT,
  prompts_total      INTEGER NOT NULL DEFAULT 0,
  prompts_completed  INTEGER NOT NULL DEFAULT 0,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

-- Raw results per prompt × platform per audit
CREATE TABLE public.audit_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id            UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  prompt_id           UUID NOT NULL REFERENCES public.prompts(id),
  platform            TEXT NOT NULL CHECK (platform IN ('chatgpt', 'gemini', 'perplexity')),
  -- Raw AI response stored verbatim — never fabricated
  raw_response        TEXT NOT NULL,
  -- Brand detection
  brand_mentioned     BOOLEAN NOT NULL DEFAULT FALSE,
  -- 1 = first entity mentioned, 2 = second, NULL = not mentioned
  brand_rank          SMALLINT,
  -- {competitor_name: rank_or_null} for all tracked competitors
  competitor_data     JSONB NOT NULL DEFAULT '{}',
  -- Sentiment of the passage where brand is mentioned (null if not mentioned)
  sentiment           TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  -- API metadata
  model_used          TEXT,
  tokens_used         INTEGER,
  latency_ms          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each prompt only runs once per platform per audit
  UNIQUE (audit_id, prompt_id, platform)
);

-- Rolled-up visibility scores per audit × platform
CREATE TABLE public.visibility_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id         UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES public.clients(id),
  -- 'overall' is the weighted average across all platforms
  platform         TEXT NOT NULL CHECK (platform IN ('chatgpt', 'gemini', 'perplexity', 'overall')),
  -- Percentage of prompts where client was mentioned (0–100)
  score            NUMERIC(5, 2) NOT NULL,
  mentions_count   INTEGER NOT NULL DEFAULT 0,
  total_prompts    INTEGER NOT NULL DEFAULT 0,
  -- Average ordinal rank when mentioned (lower = better)
  avg_rank         NUMERIC(5, 2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (audit_id, platform)
);

-- Monthly PDF reports
CREATE TABLE public.reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES public.clients(id),
  audit_id       UUID REFERENCES public.audits(id),
  report_month   DATE NOT NULL, -- first day of the report month
  -- GPT-written narrative summary stored here (not in PDF only)
  ai_summary     TEXT,
  -- Supabase Storage path
  pdf_path       TEXT,
  status         TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'sent', 'failed')),
  email_sent_at  TIMESTAMPTZ,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_audits_client_id   ON public.audits (client_id, started_at DESC);
CREATE INDEX idx_results_audit_id   ON public.audit_results (audit_id);
CREATE INDEX idx_results_prompt_id  ON public.audit_results (prompt_id);
CREATE INDEX idx_scores_client_id   ON public.visibility_scores (client_id, created_at DESC);
CREATE INDEX idx_prompts_client_id  ON public.prompts (client_id, is_active);
CREATE INDEX idx_reports_client_id  ON public.reports (client_id, report_month DESC);

-- ============================================================
-- Updated-at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated_at   BEFORE UPDATE ON public.clients   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Auto-create profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
