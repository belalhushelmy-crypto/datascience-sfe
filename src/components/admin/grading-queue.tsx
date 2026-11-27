"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { inputClass } from "@/components/ui";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import type { SubmissionStatus } from "@/lib/types";

export type GradingQueueRow = {
  id: string;
  assignment_id: string;
  student_name: string;
  username: string;
  student_code: string;
  task_title: string;
  status: SubmissionStatus;
  score: number | null;
  created_at: string;
  max_score: number;
};

const STATUS_TONE: Record<string, string> = {
  graded: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  flagged: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function GradingQueue({ rows, locale }: { rows: GradingQueueRow[]; locale: string }) {
  const t = useTranslations("admin.gradingQueue");
  const ts = useTranslations("submissionStatus");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status))), [rows]);
  const filtered = rows.filter((row) => {
    const matchesStatus = status === "all" || row.status === status;
    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      row.student_name.toLowerCase().includes(needle) ||
      row.username.toLowerCase().includes(needle) ||
      row.task_title.toLowerCase().includes(needle);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className={cn(inputClass, "max-w-sm")}
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={cn(inputClass, "max-w-52")}>
          <option value="all">{t("allStatuses")}</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {ts(value)}
            </option>
          ))}
        </select>
        <span className="ms-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {filtered.length} / {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
          {t("noResults")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--glass)]">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t("colStudent")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("colTask")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("colScore")}</th>
                <th className="px-4 py-3 text-end font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filtered.map((row) => (
                <tr key={row.id} className="transition hover:bg-[var(--glass-inset)]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{row.student_name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-muted)]">
                      @{row.username} · {row.student_code}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{row.task_title}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                      {t("attempt")} · {formatDate(row.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        STATUS_TONE[row.status] ?? "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      )}
                    >
                      {ts(row.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-end font-mono tabular-nums text-[var(--ink)]">
                    {row.score === null ? "—" : `${formatNumber(row.score, locale, 1)} / ${formatNumber(row.max_score, locale)}`}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/assignments/${row.assignment_id}/submissions/${row.id}`}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] transition hover:border-bronze-400/50 hover:text-[var(--ink)]"
                    >
                      {t("review")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
