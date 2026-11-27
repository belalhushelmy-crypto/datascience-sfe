import { describe, expect, it } from "vitest";
import {
  fingerprintCode,
  similarityBetweenSources,
  similarityPercent,
  tokenizeCode,
} from "../../src/lib/similarity";

const pythonSample = `
# A comment that must be ignored
def add(first, second):
    """Docstring must be ignored."""
    message = "string must be ignored"
    total = first + second
    for value in (first, second):
        if value < 0:
            print("negative")
    return total
`.repeat(3);

describe("Python similarity normalizer", () => {
  it("strips comments, strings and docstrings", () => {
    const tokens = tokenizeCode("# note\nx = 'hidden'\ny = \"hidden\"\n'''doc'''\nprint(x)");
    expect(tokens).toContain("print");
    expect(tokens).not.toContain("note");
    expect(tokens).not.toContain("hidden");
    expect(tokens).not.toContain("doc");
  });

  it("returns 100 for identical Python sources", () => {
    expect(similarityBetweenSources(pythonSample, pythonSample)).toBe(100);
  });

  it("returns 0 for short or unrelated sources", () => {
    expect(similarityPercent(fingerprintCode("x = 1"), fingerprintCode(pythonSample))).toBe(0);
  });

  it("detects copy/paste with renamed variables", () => {
    const renamed = pythonSample.replaceAll("first", "alpha").replaceAll("second", "beta");
    const score = similarityBetweenSources(pythonSample, renamed);
    expect(score).toBeGreaterThan(30);
  });
});
