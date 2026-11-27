import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, EmptyState, PageHeader, badgeClass } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type SessionRow = {
  id: string;
  title: string;
  session_date: string;
};

type MaterialRow = {
  session_id: string;
  file_path: string | null;
};

type AssignmentRow = {
  id: string;
};

export default async function StudentSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role === "admin") redirect(`/${locale}/admin/sessions`);

  const t = await getTranslations("sessions");
  const ts = await getTranslations("admin.sessions");
  const supabase = await createClient();

  const [sessionsResult, materialsResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, session_date")
      .order("session_date", { ascending: true })
      .limit(100)
      .returns<SessionRow[]>(),
    supabase
      .from("session_materials")
      .select("session_id, file_path")
      .limit(500)
      .returns<MaterialRow[]>(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const fileCountBySession = new Map<string, number>();
  for (const row of (materialsResult.data ?? []).filter((m) => m.file_path)) {
    fileCountBySession.set(row.session_id, (fileCountBySession.get(row.session_id) ?? 0) + 1);
  }
  const hasError = Boolean(sessionsResult.error || materialsResult.error);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {hasError ? <Alert>{t("noMaterials")}</Alert> : null}
      {sessions.length === 0 ? (
        <EmptyState title={t("noMaterials")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session, index) => {
            const number = String(index + 1).padStart(2, "0");
            const published = new Date(session.session_date).getTime() <= Date.now();
            const files = fileCountBySession.get(session.id) ?? 0;
            return (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="group overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--glass)] transition hover:border-bronze-400/50"
              >
                <div className="relative flex items-start justify-between border-b border-[var(--line)] bg-[var(--glass-inset)] px-4 py-3">
                  <span className={badgeClass}>{number}</span>
                  <span className={cn(badgeClass, published && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                    {published ? ts("published") : ts("upcoming")}
                  </span>
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-5xl font-bold text-[var(--ink)]/10">
                    {number}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-bold text-[var(--ink)]">{session.title}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{ts("noDescription")}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-soft)]">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="size-3.5" aria-hidden="true" />
                      {formatNumber(files, locale)} {ts("files")}
                    </span>
                    <span className="ms-auto text-[var(--ink-muted)]">{formatDate(session.session_date, locale)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
