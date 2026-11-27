import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GradingQueue, type GradingQueueRow } from "@/components/admin/grading-queue";
import { Alert, PageHeader, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import type { SubmissionStatus } from "@/lib/types";

export const maxDuration = 60;

type QueueSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  created_at: string;
  status: SubmissionStatus;
  final_score: number | string | null;
  ai_score: number | string | null;
  assignments: { title: string; max_score: number | string } | null;
  profiles: { full_name: string; username: string; student_code: string } | null;
};

export default async function AdminGradingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireStaff(locale);
  const t = await getTranslations("admin.gradingQueue");

  const supabase = await createClient();
  const isAdmin = profile.role === "admin";

  const assignedIds = isAdmin
    ? []
    : (
        (await supabase
          .from("profiles")
          .select("id")
          .eq("grading_teacher_id", profile.id)
          .returns<Array<{ id: string }>>()).data ?? []
      ).map((row) => row.id);

  let request = supabase
    .from("submissions")
    .select(
      "id, assignment_id, student_id, created_at, status, final_score, ai_score, assignments!submissions_assignment_id_fkey(title, max_score), profiles!submissions_student_id_fkey(full_name, username, student_code)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (!isAdmin) {
    request = request.in("student_id", assignedIds.length > 0 ? assignedIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data, error } = await request.returns<QueueSubmission[]>();

  const rows: GradingQueueRow[] = (data ?? []).map((row) => ({
    id: row.id,
    assignment_id: row.assignment_id,
    student_name: row.profiles?.full_name ?? "—",
    username: row.profiles?.username ?? "—",
    student_code: row.profiles?.student_code ?? "—",
    task_title: row.assignments?.title ?? "—",
    status: row.status,
    score: row.final_score === null && row.ai_score === null ? null : Number(row.final_score ?? row.ai_score),
    created_at: row.created_at,
    max_score: Number(row.assignments?.max_score ?? 100),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          isAdmin ? (
            <Link href="/admin/grading/settings" className={buttonSecondary}>
              {t("settings")}
            </Link>
          ) : undefined
        }
      />
      {error ? <Alert>{t("loadError")}</Alert> : null}
      <GradingQueue rows={rows} locale={locale} />
    </div>
  );
}
