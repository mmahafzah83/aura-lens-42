-- supabase/seed.sql
-- Reference and configuration rows, exported from the live database 2026-09-04.
-- Dependency-ordered: none of these tables reference auth.users or member data.
-- Contains NO member data, NO secrets, NO auth rows.
-- Re-runnable: every insert uses ON CONFLICT DO NOTHING on the primary key.

-- capability_dimensions: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...e(quote_nullable(instrument_version::text),'NULL'))||');' fr...
                                                             ^

-- onboarding_questions: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...e(quote_nullable(instrument_version::text),'NULL'))||');' fr...
                                                             ^

-- product_facts: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(updated_at::text),'NULL'))||');' fr...
                                                             ^

-- seniority_titles: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ..., '||coalesce(quote_nullable(active::text),'NULL'))||');' fr...
                                                             ^

-- register_options: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(created_at::text),'NULL'))||');' fr...
                                                             ^

-- theme_aliases: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(created_at::text),'NULL'))||');' fr...
                                                             ^

-- voice_trait_registry: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(created_at::text),'NULL'))||');' fr...
                                                             ^

-- admin_settings: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(updated_at::text),'NULL'))||');' fr...
                                                             ^

-- design_system: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(created_by::text),'NULL'))||');' fr...
                                                             ^

-- page_backgrounds: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(updated_at::text),'NULL'))||');' fr...
                                                             ^

-- desk_eval_questions: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...oalesce(quote_nullable(question_set::text),'NULL'))||');' fr...
                                                             ^

-- guide_articles: export failed — UNKNOWN - verify in Supabase dashboard
-- ERROR:  syntax error at or near ")"
LINE 1: ...|coalesce(quote_nullable(updated_at::text),'NULL'))||');' fr...
                                                             ^
