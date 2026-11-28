import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AttendanceForm } from "@/components/admin/attendance-form";
import { CodePanel } from "@/components/admin/code-panel";
import { MaterialsPanel } from "@/components/admin/materials-panel";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";
import { DeleteSessionForm } from "@/components/admin/delete-session-form";
import { EditSessionForm } from "@/components/admin/edit-session-form";
import { Alert, Card, CardHeader, EmptyState, PageHeader, badgeClass, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { idSchema } from "@/lib/validation";
import { toDataURL } from "qrcode";
import type { AttendanceStatus } from "@/lib/types";

type AdminSessionRow = {
  id: string;
  title: string;
  session_date: string;
  attendance_code: string | null;
  code_expires_at: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  username: string;
  student_code: string;
};

type AttendanceRow = {
  student_id: string;
  status: AttendanceStatus | "excused" | null;
};

type MaterialRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  file_path: string | null;
  language: string | null;
};

export default async function AdminSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);

  const sessionId = idSchema.safeParse(id);
  if (!sessionId.success) notFound();

  const t = await getTranslations("admin.session");
  const tc = await getTranslations("common");

  const supabase = await createClient();
  const [sessionsResult, studentsResult, attendanceResult, materialsResult] = await Promise.all([
    supabase.rpc("admin_list_sessions"),
    supabase
      .from("profiles")
      .select("id, full_name, username, student_code")
      .eq("role", "student")
      .order("full_name", { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from("attendance")
      .select("student_id, status")
      .eq("session_id", sessionId.data)
      .returns<AttendanceRow[]>(),
    supabase
      .from("session_materials")
      .select("id, type, title, content, file_path, language")
      .eq("session_id", sessionId.data)
      .order("created_at", { ascending: true })
      .limit(100)
      .returns<MaterialRow[]>(),
  ]);

  const session = ((sessionsResult.data ?? []) as AdminSessionRow[]).find((row) => row.id === sessionId.data);
  if (!session) notFound();

  const students = studentsResult.data ?? [];
  const attendanceRows = attendanceResult.data ?? [];
  const existing = Object.fromEntries(
    attendanceRows.map((row) => [row.student_id, row.status]),
  ) as Record<string, AttendanceStatus>;

  const countStatus = (status: string) => attendanceRows.filter((row) => row.status === status).length;
  const present = countStatus("present");
  const late = countStatus("late");
  const absent = countStatus("absent");
  const excused = countStatus("excused");
  const recorded = attendanceRows.length;
  const attendanceRate = students.length > 0 ? Math.round(((present + late) / students.length) * 100) : 0;

  const hasError = Boolean(sessionsResult.error || studentsResult.error || attendanceResult.error);

  const codeActive = Boolean(
    session.attendance_code && session.code_expires_at && Date.parse(session.code_expires_at) > Date.now(),
  );
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const checkInUrl = siteUrl ? `${siteUrl}/${locale}/check-in?code=${encodeURIComponent(session.attendance_code ?? "")}` : null;
  const qrDataUrl = codeActive && checkInUrl ? await toDataURL(checkInUrl, { width: 200, margin: 1 }) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.title}
        description={formatDate(session.session_date, locale, { dateStyle: "full" })}
        action={
          <div className="flex flex-wrap items-start gap-2">
            <CsvDownloadButton locale={locale} kind="session" id={session.id} label={t("exportAttendance")} />
            <Link href="/admin/sessions" className={buttonSecondary}>
              {t("back")}
            </Link>
          </div>
        }
      />

      {hasError ? <Alert>{tc("errorBody")}</Alert> : null}

      <div className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <CodePanel
          locale={locale}
          sessionId={session.id}
          code={session.attendance_code}
          expiresAt={session.code_expires_at}
          active={codeActive}
          qrDataUrl={qrDataUrl}
          checkInUrl={codeActive ? checkInUrl : null}
        />

        <MaterialsPanel locale={locale} sessionId={session.id} materials={materialsResult.data ?? []} />

          <Card>
            <CardHeader
              title={t("attendanceTitle")}
              action={
                <a href="#manual-attendance" className={buttonSecondary}>
                  {t("takeAttendance")}
                </a>
              }
            />
            <div className="grid grid-cols-2 gap-3 p-5">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-4">
                <p className="caption-code">{t("recorded")}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[var(--ink)]">
                  {formatNumber(recorded, locale)} / {formatNumber(students.length, locale)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-4">
                <p className="caption-code">{t("attendanceRate")}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[var(--ink)]">{formatNumber(attendanceRate, locale)}%</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-5 pb-5">
              <span className={badgeClass}>{t("present")}: {formatNumber(present, locale)}</span>
              <span className={badgeClass}>{t("late")}: {formatNumber(late, locale)}</span>
              <span className={badgeClass}>{t("absent")}: {formatNumber(absent, locale)}</span>
              <span className={badgeClass}>{t("excused")}: {formatNumber(excused, locale)}</span>
            </div>
          </Card>

        </div>
      </div>

      <div id="manual-attendance" className="scroll-mt-20">
        <Card className="p-0">
          <CardHeader title={t("manualAttendance")} description={t("attendanceSubtitle")} />
          <AttendanceForm locale={locale} sessionId={session.id} students={students} existing={existing} />
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <EditSessionForm locale={locale} sessionId={session.id} title={session.title} date={session.session_date} />
        <Card className="p-5">
          <DeleteSessionForm locale={locale} sessionId={session.id} />
        </Card>
      </div>
    </div>
  );
}
