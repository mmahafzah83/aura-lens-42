import { applyDocumentLang, initLangFromUrl, readStoredLang } from "./i18n";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "./lib/clientErrorLog";

installGlobalErrorHandlers();

// Set lang/dir before first paint so there is no flash.
try { initLangFromUrl(); applyDocumentLang(readStoredLang()); } catch { /* ignore */ }

createRoot(document.getElementById("root")!).render(<App />);

// Remove splash screen after React mounts
const splash = document.getElementById("splash");
if (splash) {
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 400);
}
