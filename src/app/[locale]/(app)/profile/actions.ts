"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toLocale } from "@/lib/locale";
import { fieldFromZodError, profileSchema } from "@/lib/validation";
import type { ProfileState } from "./types";

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "profile" });

  const profile = await getCurrentProfile();
  if (!profile) {
    return { status: "error", error: t("errors.generic") };
  }

  const parsed = profileSchema.safeParse({
    full_name: String(formData.get("full_name") ?? "").trim(),
    display_name: String(formData.get("display_name") ?? "").trim(),
    opted_out_of_leaderboard:
      formData.get("opted_out_of_leaderboard") === "on",
  });

  if (!parsed.success) {
    const field = fieldFromZodError(parsed.error);
    return {
      status: "error",
      error: t(
        field === "full_name"
          ? "errors.full_name"
          : field === "display_name"
            ? "errors.display_name"
            : "errors.generic",
      ),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      display_name: parsed.data.display_name,
      opted_out_of_leaderboard: parsed.data.opted_out_of_leaderboard,
    })
    .eq("id", profile.id);

  if (error) {
    console.error("updateProfileAction failed:", error.message);
    return { status: "error", error: t("errors.generic") };
  }

  revalidatePath(`/${locale}/profile`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/admin/students`);

  return { status: "success", message: t("saved") };
}

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function changeUsernameAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "profile" });

  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", error: t("errors.generic") };

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { status: "error", error: t("errors.username") };
  }
  if (username === profile.username) {
    return { status: "error", error: t("errors.usernameSame") };
  }

  const lastChanged = profile.username_changed_at ? Date.parse(profile.username_changed_at) : null;
  if (lastChanged !== null && Number.isFinite(lastChanged) && Date.now() - lastChanged < USERNAME_COOLDOWN_MS) {
    const next = new Date(lastChanged + USERNAME_COOLDOWN_MS);
    return {
      status: "error",
      error: t("errors.usernameCooldown", {
        date: next.toLocaleDateString(locale === "ar" ? "en-GB" : locale, {
          dateStyle: "medium",
          timeZone: "Africa/Cairo",
        }),
      }),
    };
  }

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (lookupError) return { status: "error", error: t("errors.generic") };
  if (existing) return { status: "error", error: t("errors.usernameTaken") };

  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ username, username_changed_at: now })
    .eq("id", profile.id);
  if (profileError) {
    console.error("changeUsernameAction profile update failed:", profileError.message);
    return { status: "error", error: t("errors.generic") };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
    user_metadata: { ...profile, username },
  });
  if (authError) {
    console.error("changeUsernameAction auth metadata update failed:", authError.message);
  }

  revalidatePath(`/${locale}/profile`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/admin/students`);

  return { status: "success", message: t("usernameChanged") };
}

