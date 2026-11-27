import { describe, expect, it } from "vitest";
import { toCsv } from "../../src/lib/csv-export";

describe("toCsv", () => {
  it("writes a BOM and CRLF line endings", () => {
    const csv = toCsv(["name"], [["Sara"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("keeps Arabic text intact", () => {
    const csv = toCsv(["الاسم"], [["أحمد"]], { bom: false });
    expect(csv).toBe("الاسم\r\nأحمد\r\n");
  });

  it("escapes quotes and commas", () => {
    const csv = toCsv(["note"], [['say "hi", then leave']], { bom: false });
    expect(csv).toBe('note\r\n"say ""hi"", then leave"\r\n');
  });

  it("renders null and undefined as empty cells", () => {
    expect(toCsv(["a", "b"], [[null, undefined]], { bom: false })).toBe("a,b\r\n,\r\n");
  });
});
