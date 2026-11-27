import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardEntry, PointsConfig } from "@/lib/types";

export async function loadLeaderboard(supabase: SupabaseClient) {
  const [all, week, config] = await Promise.all([
    supabase.rpc("leaderboard_page", { p_period: "all" }),
    supabase.rpc("leaderboard_page", { p_period: "week" }),
    supabase
      .from("points_config")
      .select("leaderboard_visible, weekly_reset_at")
      .eq("id", 1)
      .single<Pick<PointsConfig, "leaderboard_visible" | "weekly_reset_at">>(),
  ]);

  return {
    allEntries: (all.data ?? []) as LeaderboardEntry[],
    weekEntries: (week.data ?? []) as LeaderboardEntry[],
    weeklyResetAt: config.data?.weekly_reset_at ?? null,
    error: Boolean(all.error || week.error || config.error),
  };
}
