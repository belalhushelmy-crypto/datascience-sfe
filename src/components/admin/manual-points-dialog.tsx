"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { addManualPointsAction } from "@/actions/points";
import type { PointsConfigState } from "@/lib/types";
import { Alert, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: PointsConfigState = { status: "idle" };

export function ManualPointsDialog({
  studentId,
  studentName,
  locale,
}: {
  studentId: string;
  studentName: string;
  locale: string;
}) {
  const t = useTranslations("admin.points");
  const tc = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-bronze-700 transition hover:bg-bronze-50 dark:text-bronze-300 dark:hover:bg-bronze-500/10"
      >
        {t("addPoints")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/60"
        aria-labelledby={`points-title-${studentId}`}
      >
        {open ? (
          <div className="p-6">
            <h2 id={`points-title-${studentId}`} className="text-lg font-semibold text-[var(--ink)]">
              {t("addPointsTitle")}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {t("addPointsHint", { name: studentName })}
            </p>
            <PointsForm
              studentId={studentId}
              studentName={studentName}
              locale={locale}
              onClose={() => dialogRef.current?.close()}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function PointsForm({
  studentId,
  studentName,
  locale,
  onClose,
}: {
  studentId: string;
  studentName: string;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations("admin.points");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(addManualPointsAction, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="student_name" value={studentName} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor={`points-${studentId}`} className={labelClass}>
          {t("pointsValue")}
        </label>
        <input
          id={`points-${studentId}`}
          name="points"
          type="number"
          step="0.01"
          required
          dir="ltr"
          placeholder="0"
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("pointsValueHint")}</p>
      </div>

      <div>
        <label htmlFor={`points-reason-${studentId}`} className={labelClass}>
          {t("pointsReason")}
        </label>
        <input
          id={`points-reason-${studentId}`}
          name="reason"
          type="text"
          maxLength={300}
          className={inputClass}
          placeholder={t("pointsReasonPlaceholder")}
        />
      </div>

      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      {state.status === "success" ? (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onClose} className={buttonPrimary}>
            {tc("close")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            {tc("cancel")}
          </button>
          <SubmitButton idle={t("addPoints")} pendingLabel={t("addingPoints")} />
        </div>
      )}
    </form>
  );
}
