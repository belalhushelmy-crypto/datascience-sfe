"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { checkInAction } from "./actions";
import type { CheckInState } from "./types";
import { Alert, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: CheckInState = { status: "idle" };

export function CheckInForm({ locale, initialCode }: { locale: string; initialCode: string }) {
  const t = useTranslations("checkIn");
  const [state, formAction] = useActionState(checkInAction, initialState);

  return (
    <Card>
      <CardHeader title={t("title")} description={t("subtitle")} />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />
        <div>
          <label htmlFor="check-in-code" className={labelClass}>
            {t("codeLabel")}
          </label>
          <input
            id="check-in-code"
            name="code"
            type="text"
            required
            dir="ltr"
            defaultValue={initialCode}
            autoComplete="off"
            className={`${inputClass} font-mono uppercase`}
          />
        </div>
        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
        <SubmitButton idle={t("submit")} pendingLabel={t("submitting")} />
      </form>
    </Card>
  );
}
