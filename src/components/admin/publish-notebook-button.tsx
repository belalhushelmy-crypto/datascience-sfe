"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { publishNotebookAction, type PublishNotebookState } from "@/actions/notebooks";
import { Alert, buttonSecondary } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: PublishNotebookState = { status: "idle" };

export function PublishNotebookButton({
  locale,
  submissionId,
}: {
  locale: string;
  submissionId: string;
}) {
  const t = useTranslations("admin.review");
  const [state, formAction] = useActionState(publishNotebookAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="submission_id" value={submissionId} />
      <p className="text-xs text-[var(--ink-muted)]">{t("publishWarning")}</p>
      <SubmitButton idle={t("publishNotebook")} pendingLabel={t("publishing")} className={buttonSecondary} />
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? (
        <a href={state.url} target="_blank" rel="noopener noreferrer" className="block text-xs font-medium text-primary-600 underline">
          {t("openPublishedNotebook")}
        </a>
      ) : null}
    </form>
  );
}
