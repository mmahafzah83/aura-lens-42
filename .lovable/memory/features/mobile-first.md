---
name: Mobile-first responsive design
description: All layouts must be mobile-first with no horizontal scrolling, stacked layouts under 768px
type: preference
---
- `overflow-x: hidden` on html and body
- Typography uses `clamp()` for responsive sizing
- `card-pad` is 20px on mobile, 32px on sm+
- Pipeline grids use `grid-cols-3 sm:grid-cols-5`
- Side-by-side layouts use `flex-col lg:flex-row`
- Tab bars use `w-full sm:w-fit` with `flex-1 sm:flex-none` children
- Action button rows always use `flex-wrap`
- Card padding: `p-4 sm:p-6`
- Main content padding: `px-4 sm:px-8`
