
# SLICE 4d — One combined report PDF (plan only)

## Diagnosis

**1. `src/lib/exportReportPdf.ts` (61 lines)**
- Preloads Cairo (400/600), awaits `document.fonts.ready`, waits 150ms for Arabic glyph runs.
- Then: `mountEl.querySelectorAll("[data-report-page]")` → array in **DOM order**, throws if empty.
- Per node: `html2canvas(node, {scale:2, backgroundColor:"#ffffff", useCORS:true})` → JPEG 0.82 → one jsPDF A4 portrait page each (`addPage()` between).
- Assumptions: each `[data-report-page]` node is *itself* a full sheet already laid out (not `display:none`); width is whatever the node measures (identity sheets are fixed 794×1123); if the raster aspect is taller than A4 it is **scaled down and centred horizontally**, i.e. no clipping but a shrunk page. It is fully renderer-agnostic — it does not know about `ReportDocument`.
- **Consequence: the export needs no changes at all.** Any mount that contains Brand sheets followed by Identity sheets exports as one continuous PDF.

**2. `ReportDocument.tsx` paginator**
- `buildBlocks(data)` → `Block[] { key, section, spacing, node }`; a `Paginated` component measures every block offscreen at `CONTENT_W` (with an 80ms retry when heights come back 0), then `packSheets(blocks, heights)` greedily fills `CONTENT_H`, breaking to a new sheet on overflow; finally renders cover sheet + packed sheets + full-bleed closing plate, each as a `Sheet` with `data-report-page`.
- Coupling: `packSheets` itself is pure and trivially extractable. The measure pass (`Paginated`) is coupled to `SECTION_LABEL`, `PaperHeader/PaperFooter`, cover/closing plate and `useImprintDelta` — extractable but not free.

**3. Reproducibility — and an important existing asset**
- `useReportSnapshot` renders from frozen `report_snapshots.data` (`template_version: "aura-paper-v1"`, mirrored in `capture-report-snapshot/index.ts`).
- The Brand narrative today comes from live `diagnostic_profiles.brand_assessment_results`, so it is **not** frozen. The snapshot function already *selects* that column (it derives pillars from it) but does not store the narrative.
- **There is already a paper renderer for the Brand narrative**: `src/lib/buildBrandPaper.ts` (normalises the blob into fixed slots, with legacy-prose fallback) and `src/components/report/BrandPaperDocument.tsx` — a fixed 4-sheet layout, same 794×1123 `Sheet`, same `data-report-page`, same `AuraPaper` primitives, explicitly written so `exportReportPdf` can rasterise it. It is currently only used by `BrandAssessmentModal`. So the Brand paper does not need to be built, only wired and frozen.

## Recommendation: **Approach B** (two renderers, one export) — with a twist

Reuse the existing `BrandPaperDocument` rather than folding brand content into `ReportData`'s block stream, and freeze the normalised `BrandPaper` object into the snapshot.

Why B over A:
- **Pagination-cutoff safety** — no hand-rolled pagination either way: `BrandPaperDocument` is fixed-slot ("fits by construction") and already ships; `ReportDocument` keeps its proven measure-then-pack paginator untouched. Approach A would inject ~11 new block types into the identity paginator, i.e. new overflow risk on *every* existing page for *every* user.
- **Blast radius** — B changes only the download path plus one added snapshot field. A changes the on-screen identity preview for everyone and forces a full re-snapshot.
- **Reproducibility** — solved the same way in both: store the Brand narrative in the snapshot (below).
- **Snapshot machinery** — B needs an *additive* field, so `template_version` stays semantically valid; I would still bump to `aura-paper-v2` for the combined artifact so the version string honestly identifies the document shape.

Trade-off accepted: two renderers to maintain, and the `BrandPaper` shape must be produced identically client-side and in the edge mirror (same class of drift the report already manages).

## Proposed build (for approval)

### Freezing the Brand narrative
- Add `brand_paper: BrandPaper | null` to `ReportData` in `src/lib/buildIdentityReport.ts`, populated by calling the existing `buildBrandPaper` normaliser on the already-fetched `brand_assessment_results`.
- Mirror the same normalisation in `supabase/functions/capture-report-snapshot/index.ts` (it already selects the column) so client and edge snapshots are byte-comparable.
- Bump `TEMPLATE_VERSION` to `"aura-paper-v2"` in both places.
- No table migration required (`report_snapshots.data` is jsonb).
- **Backfill:** existing `is_current` snapshots are v1 with no `brand_paper`. Two options — (i) a jsonb migration that injects `brand_paper` computed from each user's live `brand_assessment_results` and rewrites `template_version` in place (no new version rows, keeps "Version 1 · date" stable), or (ii) re-snapshot each affected user to v2 via the existing capture path. I recommend (i) for Mohammad / Elsayed / MEELAD and the rest, since it avoids bumping everyone's visible version number for a rendering change. Renderers stay tolerant of a missing `brand_paper` regardless.

### Combined download
- `ReportViewerSection.tsx` (the hidden 794px export mount) renders `<BrandPaperDocument …/>` **then** `<ReportDocument data={report}/>` in the same mount; `exportReportPdf(mount, fileName)` is called unchanged and picks both sets of sheets up in DOM order.
- Gate the Brand sheets on `report.brand_paper` being present so a pre-backfill snapshot still exports the identity paper alone.
- Page numbering: `BrandPaperDocument` numbers 1–4 of its own paper (№ 00), `ReportDocument` numbers its own (№ 01). Cleanest low-risk option is to keep them as two numbered papers inside one issue (an editorially normal convention) rather than plumbing an offset through both footers; if you prefer continuous 1..N I will thread a `pageOffset`/`totalOverride` prop through both `PaperFooter` call sites.
- Filename: `aura-report-{slug}-v{version}-{date}.pdf` (unchanged shape).

### Download UX
- One primary button: **"Download your report (PDF)"** at the top of "Your Reports" in `IdentityTab.tsx`.
- Remove the "Export PDF" button from `ReportViewerSection`'s toolbar (the section keeps the on-screen scaled preview and the "Version N · date" line), and remove/retire the separate brand-paper export entry point on this surface. `BrandAssessmentModal`'s own export is out of scope for this slice and left alone.
- The interactive `BrandReportSection` accordion from 4b/4c stays exactly as-is for reading; only the download renders paper.

### Brand paper content order (mirrors the on-screen labels)
Cover: archetype + positioning statement + "Second nature". Then, in `BrandPaperDocument`'s existing slots, mapped from `brand_assessment_results`:
1. How the market sees you (`market_read`)
2. The honest truth (`honest_truth`)
3. What only you can do (`unique_capability`, `zone_of_genius`)
4. The space nobody else owns (`uncontested_space`)
5. Your topics (`topics[]`)
6. How you sound (`voice_signature`, `natural_tone`)
7. How you build trust (`trust_pattern`, `authority_style`)
8. Your content pillars (`content_pillars[]`)
9. Where to invest next (`invest_next[]`)
10. Areas to strengthen (`growth_areas[]`)
11. What is holding you back (`key_barrier`)
Empty-value guards drop any missing slot; on-brand vocabulary only (no "thought leader", "leverage", "utilize"). Fields `buildBrandPaper` does not yet carry (`zone_of_genius`, `voice_signature`, `authority_style`, `content_pillars`, `growth_areas`, `key_barrier`) get added to its `BrandPaper` interface.

### Arabic
Per-field detection (as in `BrandReportSection`) sets `direction: rtl`, right alignment and the Cairo stack on paper text; `exportReportPdf` already preloads Cairo. Long RTL headlines go through the existing `fitText` shrink-to-fit path; SVG figures inside `AuraPaper` need their text anchors flipped (`text-anchor: end`) for RTL rather than relying on CSS direction.

### Files touched
- `src/lib/buildIdentityReport.ts` (add `brand_paper`, bump `TEMPLATE_VERSION`)
- `src/lib/buildBrandPaper.ts` (extend slots for the 6 extra fields)
- `src/components/report/BrandPaperDocument.tsx` (render the extra sections; RTL/fitText hardening)
- `src/components/identity/ReportViewerSection.tsx` (combined export mount; drop its own button)
- `src/components/tabs/IdentityTab.tsx` (single primary download button)
- `supabase/functions/capture-report-snapshot/index.ts` (mirror `brand_paper`, bump version)
- One SQL migration: jsonb backfill of `brand_paper` + `template_version` on current snapshots
- Unchanged: `exportReportPdf.ts`, `ReportDocument.tsx`, `useReportSnapshot.ts`, scoring engine, admin.

### Risks
- **Pagination overflow** — brand sections are fixed-slot; unusually long AI prose could overflow a sheet. Mitigation: `fitText`/clamp per slot, and a QA pass across the longest existing profiles.
- **RTL** — SVG anchoring and mixed EN-in-AR runs; mitigate with the `renderBidi`/`<bdi>` approach already in `ReportDocument`.
- **`blob:`/remote avatar URLs** — html2canvas needs them inlined or `useCORS`-fetchable before export; a revoked `blob:` renders blank. Mitigation: inline to data-URL at snapshot time or skip the image if it fails to load.
- **Snapshot drift** — client vs edge `brand_paper` normalisation must stay identical; mitigate by keeping `buildBrandPaper`'s logic literally duplicated with a "KEEP IN SYNC" header (the existing convention) and adding it to `report_invariants()` checks.
- **Version confusion** — bumping `template_version` while keeping version numbers stable needs the backfill to be in-place, or users see "Version 2" for a document they never regenerated.
- **Users with no brand assessment** — download must remain disabled/absent rather than exporting a half document.

Nothing built yet — approve and I will implement in this order: extend `buildBrandPaper` → `ReportData` + edge mirror + migration → `BrandPaperDocument` sections/RTL → combined mount + single button → QA (375px, Arabic profile, longest profile).
