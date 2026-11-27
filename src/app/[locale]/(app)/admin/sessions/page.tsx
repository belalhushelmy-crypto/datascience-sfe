import { FileText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CreateSessionForm } from "@/components/admin/create-session-form";
import { FormDialog } from "@/components/admin/form-dialog";
import { Alert, EmptyState, PageHeader, badgeClass, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatNumber, cairoToday } from "@/lib/utils";
import type { SessionSummary } from "@/lib/types";

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);
  const t = await getTranslations("admin.sessions");
  const tn = await getTranslations("nav");

  const supabase = await createClient();
  const [overviewResult, materialsResult] = await Promise.all([
    supabase.rpc("admin_session_overview"),
    supabase.from("session_materials").select("session_id"),
  ]);

  const sessions = ((overviewResult.data ?? []) as SessionSummary[]).sort(
    (a, b) => Date.parse(a.session_date) - Date.parse(b.session_date),
  );
  const materialCountBySession = new Map<string, number>();
  for (const row of (materialsResult.data ?? []) as Array<{ session_id: string }>) {
    materialCountBySession.set(row.session_id, (materialCountBySession.get(row.session_id) ?? 0) + 1);
  }
  const today = cairoToday();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className={buttonSecondary}>
              {tn("overview")}
            </Link>
            <FormDialog trigger={t("createTitle")} title={t("createTitle")} description={t("createSubtitle")}>
              <CreateSessionForm locale={locale} today={today} />
            </FormDialog>
          </div>
        }
      />

      {overviewResult.error ? (
        <Alert>{t("loadError")}</Alert>
      ) : sessions.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session, index) => {
            const number = String(index + 1).padStart(2, "0");
            const published = new Date(session.session_date).getTime() <= new Date(today).getTime();
            const files = materialCountBySession.get(session.id) ?? 0;

            return (
              <Link
                key={session.id}
                href={`/admin/sessions/${session.id}`}
                className="group overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--glass)] transition hover:border-bronze-400/50"
              >
                <div className="relative flex items-start justify-between border-b border-[var(--line)] bg-[var(--glass-inset)] px-4 py-3">
                  <span className={badgeClass}>{number}</span>
                  <span
                    className={cn(
                      badgeClass,
                      published
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "",
                    )}
                  >
                    {published ? t("published") : t("upcoming")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-5xl font-bold text-[var(--ink)]/10"
                  >
                    {number}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-bold text-[var(--ink)]">{session.title}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("noDescription")}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-soft)]">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="size-3.5" aria-hidden="true" />
                      {formatNumber(files, locale)} {t("files")}
                    </span>
                    <span className="ms-auto text-[var(--ink-muted)]">
                      {formatDate(session.session_date, locale)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--ink-muted)]">
                    {formatNumber(session.checked_in_count, locale)} / {formatNumber(session.class_size, locale)}{" "}
                    {t("checkedIn")}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
