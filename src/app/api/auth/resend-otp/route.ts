import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { toLocale } from "@/lib/locale";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, locale, turnstile_token } = body;
    const localeStr = toLocale(locale);
    const t = await getTranslations({ locale: localeStr, namespace: "auth" });

    const turnstileResult = await verifyTurnstile(
      typeof turnstile_token === "string" ? turnstile_token : null,
    );
    if (!turnstileResult.ok) {
      return NextResponse.json(
        {
          error:
            turnstileResult.code === "not_configured"
              ? t("errors.captchaNotConfigured")
              : t("errors.turnstileFailed"),
        },
        { status: 400 },
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/${localeStr}/verify-email`,
      },
    });

    if (error) {
      console.error("resend-otp error:", error.message);
      return NextResponse.json({ error: "Failed to resend code" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("resend-otp error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
