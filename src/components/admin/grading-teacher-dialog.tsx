"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { assignGradingTeacherAction } from "@/actions/students";
import type { ResetPasswordState } from "@/lib/types";
import { Alert, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ResetPasswordState = { status: "idle" };

export function GradingTeacherDialog({
  studentId,
  studentName,
  teachers,
  currentTeacherId,
  locale,
}: {
  studentId: string;
  studentName: string;
  teachers: Array<{ id: string; name: string }>;
  currentTeacherId: string | null;
  locale: string;
}) {
  const t = useTranslations("admin.students");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState(currentTeacherId ?? "");

  function openDialog() {
    setTeacherId(currentTeacherId ?? "");
    setOpen(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-600 transition hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
      >
        {t("assignTeacher")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/60"
        aria-labelledby={`teacher-title-${studentId}`}
      >
        {open ? (
          <div className="p-6">
            <h2 id={`teacher-title-${studentId}`} className="text-lg font-semibold text-[var(--ink)]">
              {t("assignTeacherTitle")}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {t("assignTeacherHint", { name: studentName })}
            </p>
            <TeacherForm
              studentId={studentId}
              locale={locale}
              teachers={teachers}
              teacherId={teacherId}
              setTeacherId={setTeacherId}
              onClose={() => dialogRef.current?.close()}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function TeacherForm({
  studentId,
  locale,
  teachers,
  teacherId,
  setTeacherId,
  onClose,
}: {
  studentId: string;
  locale: string;
  teachers: Array<{ id: string; name: string }>;
  teacherId: string;
  setTeacherId: (value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(assignGradingTeacherAction, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor={`teacher-${studentId}`} className={labelClass}>
          {t("assignTeacher")}
        </label>
        <select
          id={`teacher-${studentId}`}
          name="grading_teacher_id"
          value={teacherId}
          onChange={(event) => setTeacherId(event.target.value)}
          className={inputClass}
        >
          <option value="">{t("noTeacher")}</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
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
          <SubmitButton idle={t("assignTeacherSave")} pendingLabel={t("assignTeacherSaving")} />
        </div>
      )}
    </form>
  );
}
