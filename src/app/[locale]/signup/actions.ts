"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { toLocale } from "@/lib/locale";
import { signupSchema } from "@/lib/validation";
import type { SignupState } from "@/lib/types";
import { verifyTurnstile } from "@/lib/turnstile";

export async function signupAction(
  _previous: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "auth" });

  // Honeypot check
  const honeypot = formData.get("website");
  if (honeypot) {
    return { status: "error", error: t("errors.botDetected") };
  }

  // Verify Turnstile token if configured
  const turnstileToken = formData.get("turnstile_token") as string | null;
  const turnstileResult = await verifyTurnstile(turnstileToken);
  if (!turnstileResult.ok) {
    return {
      status: "error",
      error:
        turnstileResult.code === "not_configured"
          ? t("errors.captchaNotConfigured")
          : t("errors.turnstileFailed"),
    };
  }

  const parsed = signupSchema.safeParse({
    full_name: String(formData.get("full_name") ?? "").trim(),
    username: String(formData.get("username") ?? "").trim().toLowerCase(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    confirm_password: String(formData.get("confirm_password") ?? ""),
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    const fieldErrors: Record<string, string> = {
      full_name: "errors.fullName",
      username: "errors.username",
      email: "errors.email",
      password: "errors.password",
      confirm_password: "errors.confirmPassword",
    };
    return { status: "error", error: t(fieldErrors[field as string] ?? "errors.invalid") };
  }

  const { username, email, password } = parsed.data;

  // Rate limit: per IP + per email
  // We'll use a simple in-memory approach for dev, but in production you'd want a DB table
  // For now, we'll rely on Supabase's built-in rate limiting on auth endpoints

  const supabase = await createClient();

  // Check if username already exists
  const { data: existingUser } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existingUser) {
    return { status: "error", error: t("errors.usernameTaken") };
  }

  // Check if email already exists
  const { data: existingEmail } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingEmail) {
    return { status: "error", error: t("errors.emailTaken") };
  }

  // Sign up with Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/${locale}/verify-email`,
      data: {
        username,
        full_name: parsed.data.full_name,
        display_name: parsed.data.full_name,
      },
    },
  });

  if (error) {
    console.error("signupAction error:", error.message, error);
    return { status: "error", error: t("errors.signupFailed") };
  }

  if (!data.user) {
    return { status: "error", error: t("errors.signupFailed") };
  }

  // The profile will be created by the handle_new_user trigger with role='student'
  // and email will be synced via the trigger or we can update it here

  redirect(`/${locale}/verify-email?email=${encodeURIComponent(email)}`);
}