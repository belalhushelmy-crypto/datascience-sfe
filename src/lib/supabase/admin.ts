import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serviceEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — only call it AFTER an explicit
 * `requireAdmin()` / role check in a server action or route handler.
 */
export function createAdminClient() {
  const env = publicEnv();
  const service = serviceEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, service.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
