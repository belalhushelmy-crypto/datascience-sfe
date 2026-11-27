"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { toLocale } from "@/lib/locale";
import { verifyOtpSchema } from "@/lib/validation";
import type { VerifyOtpState } from "@/lib/types";
import { verifyTurnstile } from "@/lib/turnstile";

export async function verifyOtpAction(
  _previous: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "auth" });

  const turnstileResult = await verifyTurnstile(formData.get("turnstile_token") as string | null);
  if (!turnstileResult.ok) {
    return {
      status: "error",
      error:
        turnstileResult.code === "not_configured"
          ? t("errors.captchaNotConfigured")
          : t("errors.turnstileFailed"),
    };
  }

  const parsed = verifyOtpSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    token: String(formData.get("token") ?? ""),
  });

  if (!parsed.success) {
    return { status: "error", error: t("errors.invalidCode") };
  }

  const { email, token } = parsed.data;

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error || !data.user) {
    console.error("verifyOtpAction error:", error?.message);
    return { status: "error", error: t("errors.invalidOrExpiredCode") };
  }

  // Ensure profile exists and has email synced
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ email: data.user.email })
    .eq("id", data.user.id);

  if (profileError) {
    console.error("verifyOtpAction profile sync error:", profileError.message);
  }

  redirect(`/${locale}/login?verified=1`);

  // This return is never reached due to redirect, but TypeScript needs it
  return { status: "success", message: t("verified") };
}