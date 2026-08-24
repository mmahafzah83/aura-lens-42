import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { reportVocabularyCheck } from "./scripts/check-vocabulary.mjs";

/**
 * VOCABULARY GATE as a build step. A `prebuild` npm script is not enough —
 * a deploy may call `vite build` directly — so the check runs inside the build
 * itself and throws, which fails it. `apply: "build"` already keeps it off the
 * dev SERVER; it now runs for EVERY build mode, including `build:dev`, so no
 * build path can bypass it.
 */
function vocabularyGate() {
  return {
    name: "aura-vocabulary-gate",
    apply: "build" as const,
    buildStart() {
      const hits = reportVocabularyCheck();
      if (hits.length) {
        throw new Error(
          `Vocabulary gate failed: ${hits.length} hand-written count noun(s). ` +
          `Use the formatters in src/constants/vocabulary.ts.`,
        );
      }
    },
  };
}


const BUILD_TIME = new Date().toISOString();
const BUILD_SHA =
  process.env.VITE_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  "";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },

  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    vocabularyGate(),
    mcpPlugin(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
