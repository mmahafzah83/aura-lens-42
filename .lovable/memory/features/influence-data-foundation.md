---
name: Influence Data Foundation
description: DB schema extensions and 5 UI panels for LinkedIn authority analytics history
type: feature
---
## Extended Tables
- linkedin_connections: +handle, profile_name, profile_url, source_status, timezone
- linkedin_posts: +post_url, title, hook, topic_label, framework_type, visual_style, content_type
- influence_snapshots: +impressions, reactions, comments, shares, saves, posts_count, source_type

## New Tables
- linkedin_post_metrics: time-series metrics per post (unique post_id+snapshot_date)
- content_topics: topic taxonomy with parent hierarchy
- sync_runs: sync history tracking with status/counts
- sync_errors: error log linked to sync_runs
- import_jobs: CSV/manual import tracking with row counts
- authority_scores: computed authority/momentum/consistency/engagement/resonance scores (unique user_id+snapshot_date)

## UI Panels (in Influence tab → Data Foundation view)
1. ConnectionStatusPanel: LinkedIn account handle, sync state, data freshness
2. HistoricalImportHub: CSV upload + manual entry for past data
3. DailySnapshotEngine: time-series view with 7d/30d/90d/all filters
4. DataHealthConsole: coverage %, gap detection, sync health, import integrity
5. SourceReviewPanel: inspect/filter/delete individual snapshots by source type

## Integration
- Toggle between "Intelligence" and "Data Foundation" views in InfluenceTabNew
