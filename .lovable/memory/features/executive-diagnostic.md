Executive Diagnostic onboarding flow: 7-question interview → AI skill profile generation → micro-assessment sliders.

## Tables
- diagnostic_profiles: stores firm, level, core_practice, sector_focus, north_star_goal, years_experience, leadership_style, generated_skills (jsonb), skill_ratings (jsonb), completed (bool). Unique on user_id.

## Edge Functions
- generate-skill-profile: Uses Lovable AI (gemini-2.5-flash) to generate top 10 skills based on MBB/Korn Ferry frameworks.

## Flow
- New users: see ExecutiveDiagnostic (full interview + assessment)
- Returning users (completed=true): see OnboardingSequence (splash animation)
- After diagnostic, top 5 skills are saved to skill_targets for the Skill Radar.
