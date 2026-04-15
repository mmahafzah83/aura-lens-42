

## Fix: Left column text truncation on My Story page

**Problem**: The left column is 200px wide. Identity fact values (especially "How I lead" and "Specialises in") use `truncate` CSS, cutting off text with no way to read it.

**Solution**: Replace `truncate` with word-wrap so text flows onto multiple lines instead of being clipped.

### Changes (single file)

**`src/components/tabs/IdentityTab.tsx`** — Line 268

Change the value `<span>` from:
```tsx
<span style={{ fontSize: 11, color: "#d0d0d0" }} className="truncate flex-1">
```
To:
```tsx
<span style={{ fontSize: 11, color: "#d0d0d0", wordBreak: "break-word", lineHeight: 1.4 }} className="flex-1">
```

This removes the single-line truncation and lets values wrap naturally within the 200px column. No other files or logic change.

