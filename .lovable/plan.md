

## Remove Voice Mode from Capture Panel & Rename to "Capture"

**Single file change:** `src/components/CaptureIntelligencePanel.tsx`

### What changes

1. **Remove `"voice"` from `InputMode` type** (line 11)
2. **Remove voice entry from `INPUT_MODES` array** (line 20)
3. **Remove voice-related state**: `isRecording`, `isTranscribing`
4. **Remove voice-related refs**: `mediaRecorderRef`, `chunksRef`
5. **Remove `startRecording` and `stopRecording` functions**
6. **Remove the voice recording UI block** (the `mode === "voice"` conditional render)
7. **Change grid from `grid-cols-4` to `grid-cols-3`**
8. **Rename header** from "Capture Intelligence" to "Capture"
9. **Remove unused imports**: `Mic`, `Square` (if not used elsewhere in file)

### What stays unchanged
- Link, Text, and Document capture modes — all untouched
- All backend edge functions (`ingest-capture`, `transcribe-voice`) — untouched
- Voice recording in the CaptureModal (attach) component — untouched
- All data, database tables, processing pipelines — no impact

### Impact assessment
Voice capture via the separate CaptureModal/attach flow remains fully functional. This only removes the redundant voice button from the Capture panel on the Home page.

