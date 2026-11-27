import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, buttonSecondary } from "@/components/ui";
import { LeaderboardBoard } from "@/components/leaderboard-board";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { LeaderboardEntry, PointsConfig } from "@/lib/types";

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations("leaderboard");

  const supabase = await createClient();
  const [allBoardResult, weekBoardResult, configResult] = await Promise.all([
    supabase.rpc("leaderboard_page", { p_period: "all" }),
    supabase.rpc("leaderboard_page", { p_period: "week" }),
    supabase
      .from("points_config")
      .select("leaderboard_visible, weekly_reset_at")
      .eq("id", 1)
      .single<Pick<PointsConfig, "leaderboard_visible" | "weekly_reset_at">>(),
  ]);

  const hasError = [allBoardResult.error, weekBoardResult.error, configResult.error].some(Boolean);
  const allEntries = (allBoardResult.data ?? []) as LeaderboardEntry[];
  const weekEntries = (weekBoardResult.data ?? []) as LeaderboardEntry[];

  return (
    <div className="space-y-5">
      {hasError ? <Alert>{t("loadError")}</Alert> : null}
      <LeaderboardBoard
        allEntries={allEntries}
        weekEntries={weekEntries}
        locale={locale}
        total={allEntries.length}
        weeklyHint={t("weeklyBoardHint", {
          date: formatDate(configResult.data?.weekly_reset_at ?? new Date(), locale),
        })}
        action={
          <Link href={profile.role === "admin" ? "/admin/points" : "/progress"} className={buttonSecondary}>
            {profile.role === "admin" ? t("managePoints") : t("viewProgress")}
          </Link>
        }
      />
    </div>
  );
}
