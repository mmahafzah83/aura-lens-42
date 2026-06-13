
-- audience_insights: write policies scoped to owner
CREATE POLICY "Users insert own audience insights" ON public.audience_insights FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own audience insights" ON public.audience_insights FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own audience insights" ON public.audience_insights FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- facet_states
CREATE POLICY "Users insert own facet states" ON public.facet_states FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own facet states" ON public.facet_states FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own facet states" ON public.facet_states FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- impact_narratives
CREATE POLICY "Users insert own impact narratives" ON public.impact_narratives FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own impact narratives" ON public.impact_narratives FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own impact narratives" ON public.impact_narratives FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- imprint_snapshots
CREATE POLICY "Users insert own imprint snapshots" ON public.imprint_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own imprint snapshots" ON public.imprint_snapshots FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own imprint snapshots" ON public.imprint_snapshots FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- document_chunks: missing UPDATE
CREATE POLICY "Users update own chunks" ON public.document_chunks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- eval_metrics: owner-scoped writes (service role bypasses RLS anyway)
CREATE POLICY "Users insert own eval metrics" ON public.eval_metrics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own eval metrics" ON public.eval_metrics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own eval metrics" ON public.eval_metrics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- source_events
CREATE POLICY "Users insert own source events" ON public.source_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own source events" ON public.source_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- sync_errors: allow owners to clean up
CREATE POLICY "Users delete own sync errors" ON public.sync_errors FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- linkedin_connections: explicit owner-scoped SELECT (tokens already only used by edge functions with service role; this restores client read for status checks)
CREATE POLICY "Users can view own linkedin connection" ON public.linkedin_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
