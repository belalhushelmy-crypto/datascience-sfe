"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changeUsernameAction } from "./actions";
import type { ProfileState } from "./types";
import { Alert, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: ProfileState = { status: "idle" };

export function UsernameForm({
  locale,
  username,
  nextChangeDate,
}: {
  locale: string;
  username: string;
  nextChangeDate: string | null;
}) {
  const t = useTranslations("profile");
  const [state, formAction] = useActionState(changeUsernameAction, initialState);

  return (
    <form action={formAction} className="space-y-3 p-5">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label htmlFor="new-username" className={labelClass}>
          {t("usernameChangeTitle")}
        </label>
        <input
          id="new-username"
          name="username"
          type="text"
          dir="ltr"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-z0-9_]{3,20}"
          defaultValue={username}
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("usernameChangeHint")}</p>
        {nextChangeDate ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
            {t("usernameNextChange", { date: nextChangeDate })}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
      <SubmitButton idle={t("save")} pendingLabel={t("saving")} />
    </form>
  );
}
