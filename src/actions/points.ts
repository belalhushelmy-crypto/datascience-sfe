"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { pointsConfigSchema } from "@/lib/validation";
import type { PointsConfigState } from "@/lib/types";

async function isCurrentUserAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}

function revalidatePoints(locale: string) {
  revalidatePath(`/${locale}/admin/points`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/leaderboard`);
  revalidatePath(`/${locale}/progress`);
  revalidatePath(`/${locale}/dashboard`);
}

export async function updatePointsConfigAction(
  _previous: PointsConfigState,
  formData: FormData,
): Promise<PointsConfigState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.points" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = pointsConfigSchema.safeParse({
    homework_weight: formData.get("homework_weight"),
    attendance_points: formData.get("attendance_points"),
    on_time_bonus: formData.get("on_time_bonus"),
    streak_bonus: formData.get("streak_bonus"),
    leaderboard_visible: formData.get("leaderboard_visible") === "on",
  });

  if (!parsed.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("points_config")
    .update({
      homework_weight: parsed.data.homework_weight,
      attendance_points: parsed.data.attendance_points,
      on_time_bonus: parsed.data.on_time_bonus,
      streak_bonus: parsed.data.streak_bonus,
      leaderboard_visible: parsed.data.leaderboard_visible,
    })
    .eq("id", 1);

  if (error) {
    console.error("updatePointsConfigAction failed:", error.message);
    return { status: "error", error: t("errors.saveFailed") };
  }

  revalidatePoints(locale);
  return { status: "success", message: t("saved") };
}

export async function resetWeeklyBoardAction(
  _previous: PointsConfigState,
  formData: FormData,
): Promise<PointsConfigState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.points" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("points_config")
    .update({ weekly_reset_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    console.error("resetWeeklyBoardAction failed:", error.message);
    return { status: "error", error: t("errors.resetFailed") };
  }

  revalidatePoints(locale);
  return { status: "success", message: t("resetDone") };
}

export async function recalculateBadgesAction(
  _previous: PointsConfigState,
  formData: FormData,
): Promise<PointsConfigState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.points" });

  if (!(await isCurrentUserAdmin())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_recalculate_badges");

  if (error) {
    console.error("recalculateBadgesAction failed:", error.message);
    return { status: "error", error: t("errors.recalcFailed") };
  }

  const added = Number(data ?? 0);
  revalidatePoints(locale);

  return {
    status: "success",
    message: t("recalcDone", { count: added }),
  };
}
