/**
 * CSV generation for teacher exports. RFC-4180 quoting, CRLF line endings and
 * a UTF-8 BOM (so Excel opens Arabic names correctly).
 */

export type CsvCell = string | number | null | undefined;

function escapeCell(value: CsvCell): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  headers: string[],
  rows: CsvCell[][],
  { bom = true }: { bom?: boolean } = {},
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return `${bom ? "\uFEFF" : ""}${lines.join("\r\n")}\r\n`;
}

export function csvDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function csvPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : Number(value).toFixed(1);
}
