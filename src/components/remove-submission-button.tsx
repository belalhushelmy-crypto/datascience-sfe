"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteSubmissionAction } from "@/actions/submissions";
import type { DeleteSubmissionState } from "@/actions/submissions";
import { SubmitButton } from "@/components/submit-button";

const initialState: DeleteSubmissionState = { status: "idle" };

export function RemoveSubmissionButton({
  submissionId,
  locale,
}: {
  submissionId: string;
  locale: string;
}) {
  const t = useTranslations("assignments");
  const [state, formAction] = useActionState(deleteSubmissionAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(t("removeConfirm"))) event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="locale" value={locale} />
      <SubmitButton
        idle={t("removeAttempt")}
        pendingLabel={t("removingAttempt")}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-300"
      />
      {state.status === "error" ? (
        <span className="text-xs text-rose-600 dark:text-rose-300">{state.error}</span>
      ) : null}
      {state.status === "success" ? (
        <span className="text-xs text-emerald-600 dark:text-emerald-300">{state.message}</span>
      ) : null}
    </form>
  );
}
