"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { reviewSubmissionAction } from "@/actions/assignments";
import type { SubmissionReviewState, SubmissionStatus } from "@/lib/types";

import { DiagnosticList } from "@/components/compiler-message";
import { Alert, Card, CardHeader, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: SubmissionReviewState = { status: "idle" };

export function ReviewForm({
  locale,
  submissionId,
  maxScore,
  aiScore,
  finalScore,
  status,
  feedbackEn,
  feedbackAr,
  issues,
  approved,
  requireApproval,
}: {
  locale: string;
  submissionId: string;
  maxScore: number;
  aiScore: number | null;
  finalScore: number | null;
  status: SubmissionStatus;
  feedbackEn: string | null;
  feedbackAr: string | null;
  issues: string[];
  approved: boolean;
  requireApproval: boolean;
}) {
  const t = useTranslations("admin.review");
  const [state, formAction] = useActionState(reviewSubmissionAction, initialState);
  const [score, setScore] = useState(
    finalScore !== null ? String(finalScore) : aiScore !== null ? String(aiScore) : "",
  );
  const [reviewStatus, setReviewStatus] = useState<"graded" | "flagged">(status === "flagged" ? "flagged" : "graded");

  return (
    <Card>
      <CardHeader title={t("finalTitle")} description={t("finalSubtitle")} />
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="submission_id" value={submissionId} />

        <div>
          <label htmlFor="final-score" className={labelClass}>
            {t("scoreLabel", { max: maxScore })}
          </label>
          <div className="flex gap-2">
            <input
              id="final-score"
              name="final_score"
              type="number"
              min={0}
              max={maxScore}
              step="0.5"
              required
              value={score}
              onChange={(event) => setScore(event.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              disabled={aiScore === null}
              onClick={() => {
                if (aiScore !== null) setScore(String(aiScore));
              }}
              className={`${buttonSecondary} shrink-0 px-3 text-xs`}
            >
              {t("useAiScore")}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="review-status" className={labelClass}>
            {t("statusLabel")}
          </label>
          <select
            id="review-status"
            name="status"
            value={reviewStatus}
            onChange={(event) => setReviewStatus(event.target.value as "graded" | "flagged")}
            className={inputClass}
          >
            <option value="graded">{t("statusGraded")}</option>
            <option value="flagged">{t("statusFlagged")}</option>
          </select>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("statusHint")}</p>
        </div>

        <div className="space-y-3 border-t border-[var(--line)] pt-4">
          <div>
            <label htmlFor="review-feedback-en" className={labelClass}>
              {t("feedbackEnLabel")}
            </label>
            <textarea
              id="review-feedback-en"
              name="feedback_en"
              rows={3}
              defaultValue={feedbackEn ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="review-feedback-ar" className={labelClass}>
              {t("feedbackArLabel")}
            </label>
            <textarea
              id="review-feedback-ar"
              name="feedback_ar"
              rows={3}
              dir="rtl"
              defaultValue={feedbackAr ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="review-issues" className={labelClass}>
              {t("issuesLabel")}
            </label>
            <textarea
              id="review-issues"
              name="issues"
              rows={3}
              defaultValue={issues.join("\n")}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("issuesHint")}</p>
            <div className="mt-3">
              <DiagnosticList items={issues} label={t("issuesPreview")} empty={t("noIssues")} />
            </div>
          </div>
          {requireApproval ? (
            <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3 text-sm">
              <input
                type="checkbox"
                name="approve"
                defaultChecked={approved}
                className="mt-0.5 size-4 rounded border-[var(--line-strong)] text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="block font-medium text-[var(--ink)]">{t("approveLabel")}</span>
                <span className="block text-xs text-[var(--ink-muted)]">{t("approveHint")}</span>
              </span>
            </label>
          ) : null}
        </div>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

        <SubmitButton idle={t("save")} pendingLabel={t("saving")} />
      </form>
    </Card>
  );
}
