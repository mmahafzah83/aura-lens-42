# Memory: features/publish/content-library
Updated: now

The content Library primarily stores and displays records from the 'linkedin_posts' table, sorted by 'created_at DESC' with search and status filters. The 'linkedin_posts' table now only receives rows when a post is marked as published by the user or synced from LinkedIn via the browser extension. AI-generated content is NO LONGER auto-saved to 'linkedin_posts' on generation.

Draft saves from the Create tab (both post output and Visual Companion) now write to the 'content_items' table with status='draft', using the explicit 'Save Draft' / 'Save to Library' button. The type field is set to 'post', 'carousel', or 'framework' depending on the content format. Published records support 'Log performance' metrics and manual engagement score calculations.
