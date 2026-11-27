import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUsername } from "@/lib/validation";
import type { StudentAccountSummary } from "@/lib/types";

export type CreateStudentInput = {
  username: string;
  full_name: string;
  password: string;
};

export type CreateStudentResult =
  | { ok: true; student: StudentAccountSummary; password: string }
  | { ok: false; reason: "usernameTaken" | "createFailed" };

/** URL-safe random password with plenty of entropy (default 12 chars). */
export function generatePassword(length = 12): string {
  return randomBytes(Math.ceil((length * 3) / 4) + 2)
    .toString("base64url")
    .slice(0, length);
}

/**
 * Creates `<username>@cshub.local` in Supabase Auth. The database trigger
 * creates the matching profile + student_code atomically.
 *
 * Must only be called after an admin check.
 */
export async function createStudentAccount(
  input: CreateStudentInput,
  adminClient?: SupabaseClient,
): Promise<CreateStudentResult> {
  const admin = adminClient ?? createAdminClient();
  const username = normalizeUsername(input.username);

  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("createStudentAccount lookup failed:", lookupError.message);
    return { ok: false, reason: "createFailed" };
  }
  if (existing) return { ok: false, reason: "usernameTaken" };

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@cshub.local`,
    password: input.password,
    email_confirm: true,
    app_metadata: { role: "student" },
    user_metadata: {
      username,
      full_name: input.full_name,
      display_name: input.full_name,
    },
  });

  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? "";
    if (
      message.includes("already") ||
      message.includes("registered") ||
      message.includes("duplicate key") ||
      message.includes("profiles_username_key")
    ) {
      return { ok: false, reason: "usernameTaken" };
    }
    console.error("createStudentAccount createUser failed:", error?.message);
    return { ok: false, reason: "createFailed" };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, username, student_code, full_name")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    console.error("createStudentAccount profile lookup failed:", profileError?.message);
    // Do not leave an auth user without a profile behind.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, reason: "createFailed" };
  }

  return {
    ok: true,
    student: profile as StudentAccountSummary,
    password: input.password,
  };
}
