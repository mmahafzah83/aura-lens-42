## Preflight Report

InfoTooltip slug content lives in the **database table `guide_articles`** (not in code). Each row has:
- `slug` — the lookup key (e.g. `voice-signature`)
- `answer_en` — the tooltip body text
- `formula_note_en` — optional monospace formula/note block

The `InfoTooltip` component fetches the entire corpus once via `supabase.from("guide_articles").select("slug,answer_en,formula_note_en")`, caches it for 5 minutes, and resolves `article.answer_en` by slug at render time. There is no in-code registration map.

---

## Plan

### 1. Snapshot
Create `src/components/VoiceEngineSection.pre-d7-transparency.bak.tsx` before any edits.

### 2. Database: insert new guide_articles row
Add one row to `guide_articles` with slug `voice-primary`:
- `answer_en`: English content per spec
- The AR content will be handled by the component since guide_articles only has `answer_en` — the component will need bilingual support for this slug.

### 3. Add muted subtitle line under tabs
In `VoiceEngineSection.tsx`, directly below `tabsStrip` (around L503/548), insert a conditional muted line:
- **Arabic tab active**: `الصوت الأساسي — مُحدد من منشوراتك الأخيرة`
- **English tab active**: `Primary voice — set by your recent posts`

Style: same muted eyebrow family (`color: #8A8170`, `fontSize: 12`, no `letterSpacing` on Arabic).

### 4. Add InfoTooltip with slug `voice-primary`
Append an `InfoTooltip` next to the subtitle line. Because `guide_articles` currently only stores `answer_en`, the component will need to supply bilingual content inline for this slug (or we add an `answer_ar` column). Given the existing EF/tooling, the simplest approach is to pass the content as `children` to `InfoTooltip` when `slug === "voice-primary"` rather than using the corpus, since the corpus has no Arabic field.

Tooltip content:
- **AR**: `مكتبتك تحدد الصوت الأساسي. التعليم يصقله. المنشورات المُعجَب بها تشكّل الأسلوب فقط. ملاحظاتك تضبطه.`
- **EN**: `Your library decides the primary voice. Teaching refines it. Admired posts shape style only. Your feedback tunes it.`

### 5. Self-check
- Run `tsc --noEmit` to confirm clean compilation.
- Verify the muted line renders correctly under both tabs.
- Verify the tooltip opens with the correct language content per active tab.

---

## Open Question

The `guide_articles` table has only `answer_en` (no Arabic column). Should we:
- **A)** Add the English tooltip text to `guide_articles` and pass Arabic inline in the component (mixed approach)
- **B)** Add an `answer_ar` column to `guide_articles` so all tooltips can be bilingual via the corpus

Option A is minimal and matches the current schema. Option B is more correct long-term but requires a migration.