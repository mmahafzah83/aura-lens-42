import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSignalsTool from "./tools/list-signals";
import getSignalTool from "./tools/get-signal";
import listPostsTool from "./tools/list-posts";
import createCaptureTool from "./tools/create-capture";

// The OAuth issuer MUST be the direct Supabase host, built from the project
// ref (not SUPABASE_URL, which may be the .lovable.cloud proxy). Vite inlines
// this literal at build time so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "aura-mcp",
  title: "Aura",
  version: "0.1.0",
  instructions:
    "Aura is a strategic intelligence platform for senior executives. Use these tools, as the signed-in Aura user, to list active strategic signals, inspect a signal's evidence, review the user's recent LinkedIn posts, and capture new notes/articles into Aura for signal detection.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listSignalsTool, getSignalTool, listPostsTool, createCaptureTool],
});