Executive Diagnostic onboarding flow: 9-question interview → Evidence Matrix assessment (no sliders).

## Tables
- diagnostic_profiles: stores firm, level, core_practice, sector_focus, north_star_goal (pipe-delimited multi-select), years_experience (e.g. "18y total / 12y consulting"), leadership_style, generated_skills (jsonb), skill_ratings (jsonb from evidence matrix), completed (bool), brand_pillars. Unique on user_id.

## Evidence Matrix (hardcoded in diagnostic/EvidenceMatrix.ts)
- 10 skills × 3 Yes/No questions each = 30 questions total
- Score: 0 checks=10%, 1=40%, 2=70%, 3=100%
- Skills: Strategic Architecture, C-Suite Stewardship, Sector Foresight, Digital Synthesis, Executive Presence, Commercial Velocity, Human-Centric Leadership, Operational Resilience, Geopolitical Fluency, Value-Based P&L

## Interview Questions
- Firm, Level, Core Practice, Sector Focus, Experience (dual: total + consulting), Leadership Style, North Star (multi-select), Challenges (multi-select), Brand Pillars
- If Total > 15 and Consulting < 10 → "Industry Expert Pivot" tag

## Flow
- New users: see ExecutiveDiagnostic (interview → evidence matrix one skill at a time)
- Returning users (completed=true): see OnboardingSequence (splash animation)
- After diagnostic, top 5 skills saved to skill_targets for Skill Radar
