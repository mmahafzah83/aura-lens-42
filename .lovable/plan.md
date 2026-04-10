

## Plan: Add "Open" Button to Source Cards

### What changes
**Single file:** `src/components/tabs/SourcesSubTab.tsx`

### Implementation

1. **Add an "Open" button** to each source card, positioned in the top-right area (before the pin button, around `right: 68px`). It will use the `ExternalLink` Lucide icon (already imported) with no text label to keep it compact.

2. **Button behavior — always opens in a new browser tab:**
   - **URL entries** (`type === "link"`): Opens the URL from `entry.image_url` or extracted from `entry.content` via `window.open(url, "_blank")`
   - **Document / Image entries**: Opens `entry.image_url` in a new tab (this is where uploaded file URLs are stored)
   - **Notes / Voice entries** (no external URL): Opens a `data:text/plain` blob URL in a new tab showing the full content text, so the user can still "open" and read it separately

3. **Styling:** Same muted icon style as the pin/delete buttons — `color: #555`, hover to `#C5A55A`. Tooltip: "Open in new tab". Stops click propagation so it doesn't trigger the card expand.

4. **Also add the same "Open" button in the expanded view** action buttons row (next to Edit, Delete, Detect Signal) as a labeled button: `ExternalLink` icon + "Open" text, gold outline style matching the other action buttons.

### What stays the same
- All other sub-tabs, sidebar, pipeline bar, stat cards
- Pin, delete, expand/collapse, search, filter, sort functionality
- No database or Edge Function changes

