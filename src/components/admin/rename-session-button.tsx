"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateSessionAction } from "@/actions/sessions";
import type { SessionFormState } from "@/lib/types";
import { Alert, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: SessionFormState = { status: "idle" };

export function RenameSessionButton({
  locale,
  sessionId,
  title,
  date,
}: {
  locale: string;
  sessionId: string;
  title: string;
  date: string;
}) {
  const t = useTranslations("admin.session");
  const tc = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(title);
          setOpen(true);
          dialogRef.current?.showModal();
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line-strong)] px-3 py-2 text-xs font-medium text-[var(--ink-soft)] transition hover:border-bronze-400/50 hover:text-[var(--ink)]"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        {t("rename")}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/70"
        aria-label={t("rename")}
      >
        {open ? (
          <div className="p-6">
            <h2 className="text-lg font-bold text-[var(--ink)]">{t("rename")}</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("renameHint")}</p>
            <RenameForm
              locale={locale}
              sessionId={sessionId}
              date={date}
              name={name}
              setName={setName}
              onClose={() => dialogRef.current?.close()}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function RenameForm({
  locale,
  sessionId,
  date,
  name,
  setName,
  onClose,
}: {
  locale: string;
  sessionId: string;
  date: string;
  name: string;
  setName: (value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.session");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(updateSessionAction, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="session_date" value={date} />
      <div>
        <label htmlFor={`rename-${sessionId}`} className={labelClass}>
          {t("titleLabel")}
        </label>
        <input
          id={`rename-${sessionId}`}
          name="title"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
      </div>
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>
          {tc("cancel")}
        </button>
        {state.status === "success" ? (
          <button type="button" onClick={onClose} className={buttonPrimary}>{tc("close")}</button>
        ) : (
          <SubmitButton idle={t("save")} pendingLabel={t("savingDetails")} />
        )}
      </div>
    </form>
  );
}
