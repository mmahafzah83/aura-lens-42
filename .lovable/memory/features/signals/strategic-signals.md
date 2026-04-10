# Memory: features/signals/strategic-signals
Updated: now

Strategic signals are managed in the 'strategic_signals' table and processed via the 'detect-signals' Edge Function. Signal confidence is calculated using a weighted formula: (AI score * 0.5) + (source_diversity * 0.3) + (recency * 0.2), where diversity is based on unique organization domains and recency rewards fragments updated within 7 days. The pipeline reinforces existing signals by appending evidence and recalculating confidence to prevent duplicates. The Signals sub-tab on the Intelligence page features sorting (Confidence, Recent, Sources), a 'Group by theme' toggle, and 'NEW' badges for signals updated within 48 hours. Confidence bars use conditional coloring: Gold (#C5A55A) for >=80%, muted amber for 60-79%, and dim gray for <60%.

## Smart Grouping (Hybrid 4-group model)
When "Group by theme" is toggled ON, signals are classified into 4 strategic categories derived from the user's diagnostic_profiles:
1. **My industry** — matches `sector_focus` keywords. Label = `My industry · {sector}` or "My industry".
2. **My expertise** — matches `core_practice` + `brand_pillars` keywords. Label = `My expertise · {practice}` or "My expertise".
3. **My ambition** — matches `north_star_goal` + career terms. Label = `My ambition · {goal}` or "My ambition".
4. **Wider landscape** — everything else.

Classification scans signal's theme_tags, signal_title, and explanation against keyword sets. Priority: Industry > Edge > Trajectory > Horizon. Group order is fixed. Filter chips still use raw theme_tags independently.
