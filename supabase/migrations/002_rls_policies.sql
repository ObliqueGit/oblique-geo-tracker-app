-- ============================================================
-- Row Level Security — internal staff only, no public access
-- ============================================================

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visibility_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports          ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller an authenticated Oblique staff member?
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is the caller an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles: staff can read all, edit own; admin can edit all
CREATE POLICY "staff_read_profiles"   ON public.profiles FOR SELECT USING (is_staff());
CREATE POLICY "own_update_profile"    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- clients: all staff can read/write
CREATE POLICY "staff_read_clients"    ON public.clients FOR SELECT USING (is_staff());
CREATE POLICY "staff_insert_clients"  ON public.clients FOR INSERT WITH CHECK (is_staff());
CREATE POLICY "staff_update_clients"  ON public.clients FOR UPDATE USING (is_staff());
CREATE POLICY "admin_delete_clients"  ON public.clients FOR DELETE USING (is_admin());

-- competitors
CREATE POLICY "staff_read_competitors"   ON public.competitors FOR SELECT USING (is_staff());
CREATE POLICY "staff_modify_competitors" ON public.competitors FOR ALL USING (is_staff());

-- prompts
CREATE POLICY "staff_read_prompts"   ON public.prompts FOR SELECT USING (is_staff());
CREATE POLICY "staff_modify_prompts" ON public.prompts FOR ALL USING (is_staff());

-- audits
CREATE POLICY "staff_read_audits"   ON public.audits FOR SELECT USING (is_staff());
CREATE POLICY "staff_insert_audits" ON public.audits FOR INSERT WITH CHECK (is_staff());
CREATE POLICY "staff_update_audits" ON public.audits FOR UPDATE USING (is_staff());

-- audit_results (service role writes, staff reads)
CREATE POLICY "staff_read_results"   ON public.audit_results FOR SELECT USING (is_staff());
CREATE POLICY "service_write_results" ON public.audit_results FOR INSERT WITH CHECK (TRUE); -- service role only

-- visibility_scores
CREATE POLICY "staff_read_scores"    ON public.visibility_scores FOR SELECT USING (is_staff());
CREATE POLICY "service_write_scores" ON public.visibility_scores FOR INSERT WITH CHECK (TRUE);

-- reports
CREATE POLICY "staff_read_reports"   ON public.reports FOR SELECT USING (is_staff());
CREATE POLICY "service_write_reports" ON public.reports FOR ALL USING (TRUE);
