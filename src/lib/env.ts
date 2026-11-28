import "server-only";
import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

const serviceSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

type PublicEnv = z.infer<typeof publicSchema>;
type ServiceEnv = z.infer<typeof serviceSchema>;

let publicCache: PublicEnv | null = null;
let serviceCache: ServiceEnv | null = null;

/**
 * Public Supabase config (safe for the browser).
 * Validated lazily so `next build` does not need real credentials.
 */
export function publicEnv(): PublicEnv {
  if (!publicCache) {
    const parsed = publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    if (!parsed.success) {
      throw new Error(
        "Missing Supabase environment variables. Copy .env.example to .env.local and fill it in.",
      );
    }
    publicCache = parsed.data;
  }
  return publicCache;
}

/**
 * Server-only secrets. NEVER import this from a client component.
 */
export function serviceEnv(): ServiceEnv {
  if (!serviceCache) {
    const parsed = serviceSchema.safeParse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    if (!parsed.success) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local and to your Vercel project.",
      );
    }
    serviceCache = parsed.data;
  }
  return serviceCache;
}
