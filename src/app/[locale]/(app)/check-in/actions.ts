"use server";

import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { CheckInState } from "./types";

export async function checkInAction(
  _previous: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "checkIn" });
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") {
    return { status: "error", error: t("errors.studentsOnly") };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code || !/^[a-z0-9]{4,12}$/i.test(code)) {
    return { status: "error", error: t("errors.invalidFormat") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_attendance", { p_code: code });
  if (error) {
    const message = error.message.toLowerCase();
    return {
      status: "error",
      error: message.includes("invalid_code")
        ? t("errors.invalidCode")
        : t("errors.generic"),
    };
  }

  const row = (data ?? [])[0] as { session_title?: string; status?: string } | undefined;
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/sessions`);
  return {
    status: "success",
    message: t("successBody", { session: row?.session_title ?? "", status: row?.status ?? "present" }),
  };
}
