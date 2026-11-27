import type { GradingInput, GradingResponse } from "./schema";

export const MOCK_MODEL = "mock-dev";

/**
 * Deterministic stand-in used only when AI_MOCK=1 in development and no API
 * key is configured. It uses Python-specific structural checks (`#` comments,
 * def blocks, docstrings) and is never enabled in production.
 */
export function mockGrade(input: GradingInput): GradingResponse {
  const code = input.code;
  const lines = code.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const issues: string[] = [
    "Mock grading is enabled in development — no AI model was called.",
  ];

  let ratio = 0.4;

  if (/^\s*#\s*.*$/m.test(code)) ratio += 0.1;
  else issues.push("No Python # comments were found.");

  if (/\bdef\s+[A-Za-z_]\w*\s*\(/.test(code)) ratio += 0.15;
  else issues.push("No def function was found.");

  if (/\b(for|while)\s+[^:]+:/.test(code)) ratio += 0.05;
  if (/\bif\s+[^:]+:/.test(code)) ratio += 0.05;

  if (/\bprint\s*\(/.test(code) || /\binput\s*\(/.test(code)) ratio += 0.1;
  else issues.push("No print() or input() call was found.");

  if (/("""|''')/.test(code)) ratio += 0.05;

  if (lines.length >= 10) ratio += 0.05;

  const score = Math.round(Math.min(1, ratio) * input.maxScore * 10) / 10;

  return {
    score,
    feedback_en: `Mock Python structural grade: ${issues.length === 1 ? "all checks passed" : "review the listed issues"}.`,
    feedback_ar: `تقييم تجريبي لهيكل كود Python: ${issues.length === 1 ? "اجتاز كل الفحوص" : "راجع الملاحظات المدرجة"}.`,
    issues: issues.slice(0, 6),
    rubric_scores: [],
  };
}
