import { supabase } from "@/integrations/supabase/client";

/**
 * Wrapper around supabase.functions.invoke that ensures a valid session
 * is attached before calling. Returns { data: null, error } when the user
 * is not signed in, instead of producing a 401 from the edge function.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options: Parameters<typeof supabase.functions.invoke>[1] = {},
) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    return {
      data: null as T | null,
      error: new Error("No active session"),
    };
  }
  return supabase.functions.invoke<T>(functionName, options);
}