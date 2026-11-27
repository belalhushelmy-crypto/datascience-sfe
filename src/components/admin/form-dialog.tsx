"use client";

import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonPrimary } from "@/components/ui";
import { cn } from "@/lib/utils";

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
        className={cn(
          "m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/70",
          wide ? "max-w-4xl" : "max-w-lg",
        )}
        aria-label={title}
      >
        {open ? (
          <div className="relative p-3 sm:p-4">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={tc("close")}
              className="absolute end-3 top-3 z-10 grid size-8 place-items-center rounded-lg bg-[var(--bg)]/80 text-[var(--ink-muted)] backdrop-blur transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <div className="w-full">{children}</div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
