import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GradeSubmissionButton } from "@/components/admin/grade-submission-button";
import { ReviewForm } from "@/components/admin/review-form";
import { PublishNotebookButton } from "@/components/admin/publish-notebook-button";
import { CodePanel } from "@/components/code-panel";
import { CompilerMessage } from "@/components/compiler-message";
import { Alert, Card, CardHeader, PageHeader, badgeClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { colabUrl, isNotebookPath } from "@/lib/colab";
import { displayFileName, isBinaryPath } from "@/lib/file-types";
import { colabGithubUrl } from "@/lib/notebook-github";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { gradingStatus } from "@/lib/grading/service";
import { formatDate, formatNumber, stringList } from "@/lib/utils";
import { idSchema } from "@/lib/validation";
import type { SubmissionStatus } from "@/lib/types";

export const maxDuration = 60;

type ReviewRow = {
  id: string;
  assignment_id: string;
  file_path: string;
  code_text: string;
  submission_type: "file" | "text";
  ai_score: number | string | null;
  ai_feedback: string | null;
  ai_feedback_ar: string | null;
  ai_issues: unknown;
  ai_model: string | null;
  ai_graded_at: string | null;
  feedback_approved_at: string | null;
  notebook_github_path: string | null;
  final_score: number | string | null;
  status: SubmissionStatus;
  created_at: string;
  grading_error: string | null;
  assignments: {
    id: string;
    title: string;
    max_score: number | string;
    require_feedback_approval: boolean | null;
  } | null;
  profiles: {
    full_name: string;
    username: string;
    student_code: string;
  } | null;
};

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; submissionId: string }>;
}) {
  const { locale: raw, id, submissionId } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);

  const assignmentId = idSchema.safeParse(id);
  const parsedSubmissionId = idSchema.safeParse(submissionId);
  if (!assignmentId.success || !parsedSubmissionId.success) notFound();

  const t = await getTranslations("admin.review");
  const ts = await getTranslations("submissionStatus");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, assignment_id, file_path, code_text, submission_type, ai_score, ai_feedback, ai_feedback_ar, ai_issues, ai_model, ai_graded_at, feedback_approved_at, notebook_github_path, final_score, status, created_at, grading_error, assignments!submissions_assignment_id_fkey(id, title, max_score, require_feedback_approval), profiles!submissions_student_id_fkey(full_name, username, student_code)",
    )
    .eq("id", parsedSubmissionId.data)
    .eq("assignment_id", assignmentId.data)
    .maybeSingle()
    .returns<ReviewRow | null>();

  if (error || !data || !data.assignments) notFound();

  const assignment = data.assignments;
  const student = data.profiles;
  const maxScore = Number(assignment.max_score) || 100;
  const aiScore = data.ai_score === null ? null : Number(data.ai_score);
  const finalScore = data.final_score === null ? null : Number(data.final_score);
  const issues = stringList(data.ai_issues);
  const grading = gradingStatus();

  const isFileSubmission = data.submission_type === "file" && data.file_path;
  const signedResult = isFileSubmission
    ? await supabase.storage.from("submissions").createSignedUrl(data.file_path!, 600)
    : { data: { signedUrl: null } as any, error: null };
  const signedUrl = signedResult.data?.signedUrl ?? null;

  // Do not publish notebooks on page view. Publishing is an explicit staff
  // action (see PublishNotebookButton) because the Colab repo is public.
  const colabHref = signedUrl && data.notebook_github_path
    ? colabGithubUrl(data.notebook_github_path)
    : signedUrl
      ? colabUrl(signedUrl)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/assignments/${assignment.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-soft)] transition hover:text-[var(--ink)] dark:hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 rtl:-scale-x-100"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t("back")}
        </Link>
      </div>

      <PageHeader
        title={student?.full_name ?? t("title")}
        description={[
          student ? `@${student.username}` : null,
          student?.student_code ?? null,
          assignment.title,
          formatDate(data.created_at, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass}>
              {aiScore === null
                ? t("noAiScore")
                : t("aiScoreShort", {
                    score: formatNumber(aiScore, locale, 1),
                    max: formatNumber(maxScore, locale),
                  })}
            </span>
            <span className={`${badgeClass} bg-[var(--glass-inset)] text-[var(--ink-soft)] `}>
              {data.submission_type === "text" ? t("typeText") : t("typeFile")}
            </span>
            <span
              className={
                data.status === "graded"
                  ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : data.status === "flagged"
                    ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    : "rounded-full bg-[var(--glass-inset)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)] "
              }
            >
              {ts(data.status)}
            </span>
          </div>
        }
      />

      <div className="mx-auto max-w-4xl space-y-6">
          <Card className="overflow-hidden">
            <CardHeader
              title={t("codeTitle")}
              action={
                signedUrl ? (
                  <span className="flex flex-wrap items-center justify-end gap-3">
                    {isNotebookPath(data.file_path) ? (
                      <a
                        href={colabHref ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-primary-600 transition hover:text-primary-500 dark:text-primary-400"
                      >
                        {t("openInColab")}
                      </a>
                    ) : null}
                    <a
                      href={signedUrl}
                      download
                      className="text-xs font-semibold text-bronze-700 transition hover:text-bronze-600 dark:text-bronze-300"
                    >
                      {t("download")}
                    </a>
                  </span>
                ) : null
              }
            />
            {isNotebookPath(data.file_path) ? (
              <div className="p-6">
                <p className="caption-code">jupyter notebook</p>
                <p className="mt-2 break-all font-mono text-sm text-[var(--ink)]">
                  {displayFileName(data.file_path, "notebook.ipynb")}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">{t("notebookHint")}</p>
              </div>
            ) : isBinaryPath(data.file_path) ? (
              <div className="p-6">
                <p className="caption-code">file</p>
                <p className="mt-2 break-all font-mono text-sm text-[var(--ink)]">
                  {displayFileName(data.file_path, "submission")}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">{t("binaryFileHint")}</p>
              </div>
            ) : (
              <CodePanel
                code={data.code_text || "No content"}
                title={displayFileName(data.file_path, `${student?.student_code ?? "submission"}.txt`)}
                maxHeight="34rem"
                className="rounded-none border-0"
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title={t("aiTitle")}
              description={
                data.ai_model
                  ? t("aiSubtitle", {
                      model: data.ai_model,
                      date: data.ai_graded_at
                        ? formatDate(data.ai_graded_at, locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—",
                    })
                  : undefined
              }
              action={
                (data.assignments?.require_feedback_approval ?? true)
                  ? (
                      <span className={badgeClass}>
                        {data.feedback_approved_at ? t("feedbackApproved") : t("feedbackPending")}
                      </span>
                    )
                  : undefined
              }
            />
            <div className="space-y-4 p-5">
              {data.grading_error ? (
                <CompilerMessage tone="error" label="grading.error">
                  {data.grading_error.slice(0, 300)}
                </CompilerMessage>
              ) : null}
              <p className="text-sm leading-relaxed text-[var(--ink-muted)]">{t("feedbackEditHint")}</p>
              {isNotebookPath(data.file_path) ? (
                <PublishNotebookButton locale={locale} submissionId={data.id} />
              ) : null}
            </div>
          </Card>

          <ReviewForm
            locale={locale}
            submissionId={data.id}
            maxScore={maxScore}
            aiScore={aiScore}
            finalScore={finalScore}
            status={data.status}
            feedbackEn={data.ai_feedback}
            feedbackAr={data.ai_feedback_ar}
            issues={issues}
            approved={Boolean(data.feedback_approved_at)}
            requireApproval={data.assignments?.require_feedback_approval ?? true}
          />

          <Card>
        <CardHeader title={t("regradeTitle")} description={t("regradeSubtitle")} />
        <div className="p-5">
          {grading.configured ? (
            <GradeSubmissionButton locale={locale} submissionId={data.id} />
          ) : (
            <Alert tone="info">{t("errors.gradingNotConfigured")}</Alert>
          )}
        </div>
          </Card>
      </div>
    </div>
  );
}
