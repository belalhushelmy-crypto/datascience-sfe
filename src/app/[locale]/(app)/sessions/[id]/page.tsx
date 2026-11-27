import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, Card, CardHeader, EmptyState, PageHeader, buttonSecondary } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type SessionRow = { id: string; title: string; session_date: string };
type MaterialRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  file_path: string | null;
  language: string | null;
};

export default async function StudentSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireProfile(locale);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const t = await getTranslations("sessions");
  const supabase = await createClient();
  const [sessionResult, materialsResult] = await Promise.all([
    supabase.from("sessions").select("id, title, session_date").eq("id", parsedId.data).maybeSingle().returns<SessionRow | null>(),
    supabase
      .from("session_materials")
      .select("id, type, title, content, file_path, language")
      .eq("session_id", parsedId.data)
      .order("created_at", { ascending: true })
      .limit(200)
      .returns<MaterialRow[]>(),
  ]);

  const session = sessionResult.data;
  if (!session) notFound();
  const materials = materialsResult.data ?? [];

  const signed = new Map<string, string>();
  await Promise.all(
    materials.filter((m) => m.file_path).map(async (m) => {
      const { data } = await supabase.storage.from("session-materials").createSignedUrl(m.file_path as string, 3600);
      if (data?.signedUrl) signed.set(m.id, data.signedUrl);
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.title}
        description={formatDate(session.session_date, locale, { dateStyle: "full" })}
        action={<Link href="/sessions" className={buttonSecondary}>{t("title")}</Link>}
      />
      {(sessionResult.error || materialsResult.error) ? <Alert>{t("noMaterials")}</Alert> : null}
      <Card>
        <CardHeader title={t("title")} description={t("subtitle")} />
        <div className="space-y-4 p-5">
          {materials.length === 0 ? (
            <EmptyState title={t("noMaterials")} />
          ) : (
            <ul className="space-y-3">
              {materials.map((m) => {
                const url = signed.get(m.id);
                return (
                  <li key={m.id} className="rounded-xl border border-[var(--line)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--ink)]">{m.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{m.type}</p>
                      </div>
                      {url ? (
                        <a href={url} download className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-primary-600 transition hover:border-bronze-400/50 dark:text-primary-400">
                          <Download className="size-3.5" aria-hidden="true" />
                          {t("download")}
                        </a>
                      ) : null}
                    </div>
                    {(m.type === "text" || m.type === "code") && m.content ? (
                      <pre className="code-panel mt-3 overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed text-slate-200" dir="ltr"><code>{m.content}</code></pre>
                    ) : null}
                    {m.type === "image" && url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={m.title} loading="lazy" className="mt-3 max-h-96 w-full rounded-lg object-contain" />
                    ) : null}
                    {m.type === "video" && url ? <video src={url} controls className="mt-3 max-h-96 w-full rounded-lg" /> : null}
                    {!url && m.file_path ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)]"><FileText className="size-3.5" /> {m.title}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
