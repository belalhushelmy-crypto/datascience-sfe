"use client";

import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonPrimary } from "@/components/ui";

export function FormDialog({
  trigger,
  title,
  description,
  children,
  wide = false,
}: {
  trigger: string;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const tc = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); dialogRef.current?.showModal(); }} className={buttonPrimary}>
        {trigger}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/70"
        aria-labelledby="form-dialog-title"
      >
        {open ? (
          <div className="relative p-5 sm:p-6">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={tc("close")}
              className="absolute end-4 top-4 grid size-8 place-items-center rounded-lg text-[var(--ink-muted)] transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <div className="pe-10">
              <h2 id="form-dialog-title" className="text-xl font-bold tracking-tight text-[var(--ink)]">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-[var(--ink-muted)]">{description}</p> : null}
            </div>
            <div className={`mt-5 ${wide ? "max-w-3xl" : "max-w-xl"}`}>{children}</div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
