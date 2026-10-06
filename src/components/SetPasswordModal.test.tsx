import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import SetPasswordModal from "./SetPasswordModal";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), signOut: vi.fn(), rtl: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, auth: { signOut: mocks.signOut } } }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isRTL: mocks.rtl, t: (key: string) => key }) }));

afterEach(() => { vi.clearAllMocks(); mocks.rtl = false; localStorage.clear(); });

it.each([false, true])("keeps rejected passwords in the modal without sign-out (RTL=%s)", async (rtl) => {
  mocks.rtl = rtl;
  const message = "Password is known to be weak and easy to guess, please choose a different one.";
  mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: message }), { status: 400 }) } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<SetPasswordModal open onClose={() => {}} />); });
  const inputs = document.querySelectorAll("input");
  await act(async () => {
    for (const input of inputs) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "fixture-password");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const button = [...document.querySelectorAll("button")].find(b => b.textContent === "auth.reset.submit")!;
  await act(async () => { button.click(); });
  expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
  expect(document.querySelector('[role="alert"]')).toHaveTextContent(rtl ? "pwModal.updateFailed" : message);
  expect(button).not.toBeDisabled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(localStorage.getItem("password_set")).toBeNull();
  await act(async () => { root.unmount(); });
  host.remove();
});