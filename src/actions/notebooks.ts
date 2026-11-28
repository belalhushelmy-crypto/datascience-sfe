"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureNotebookGithubPath, colabGithubUrl } from "@/lib/notebook-github";
import { idSchema } from "@/lib/validation";

export type PublishNotebookState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string; url: string };

/**
 * Explicit staff-only publish. The Colab GitHub repo is public, so notebooks
 * must never be published implicitly while a page is rendered.
 */
export async function publishNotebookAction(
  _previous: PublishNotebookState,
  formData: FormData,
): Promise<PublishNotebookState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.review" });
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "teacher")) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const submissionId = idSchema.safeParse(formData.get("submission_id"));
  if (!submissionId.success) return { status: "error", error: t("errors.invalid") };

  const admin = createAdminClient();
  const { data: submission } = await admin
    .from("submissions")
    .select("id, file_path, notebook_github_path")
    .eq("id", submissionId.data)
    .maybeSingle()
    .returns<{ id: string; file_path: string | null; notebook_github_path: string | null } | null>();

  if (!submission?.file_path || !submission.file_path.toLowerCase().endsWith(".ipynb")) {
    return { status: "error", error: t("errors.invalid") };
  }

  try {
    const path = submission.notebook_github_path ?? (await ensureNotebookGithubPath(submission.id, submission.file_path));
    if (!path) return { status: "error", error: t("errors.generic") };
    revalidatePath(`/${locale}/admin/assignments`);
    return {
      status: "success",
      message: t("notebookPublished"),
      url: colabGithubUrl(path),
    };
  } catch (error) {
    console.error("publishNotebookAction failed:", error);
    return { status: "error", error: t("errors.generic") };
  }
}
