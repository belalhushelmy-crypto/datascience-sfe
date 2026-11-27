/**
 * Lightweight, dependency-free source similarity for Python submissions.
 *
 * Normalization removes comments and string literals, then tokenizes. Tokens
 * are grouped into fixed-size shingles (5-grams) and hashed; the similarity
 * is the Jaccard index of the shingle sets. This catches copy/paste with
 * renamed variables only up to a point, which is the intended "review this
 * pair" signal — not a verdict.
 */

export const SHINGLE_SIZE = 5;
export const MIN_TOKENS = 40;

export type CodeFingerprint = {
  tokenCount: number;
  shingles: Set<number>;
};

function stripNoise(source: string): string {
  return source
    .replace(/"""[\s\S]*?"""/g, ' "docstr" ')
    .replace(/'''[\s\S]*?'''/g, " 'docstr' ")
    .replace(/"(?:\\.|[^"\\])*"/g, ' "str" ')
    .replace(/'(?:\\.|[^'\\])*'/g, " 'str' ")
    .replace(/#[^\n\r]*/g, " ");
}

export function tokenizeCode(source: string): string[] {
  const tokens = stripNoise(source).match(/[A-Za-z_]\w*|\d+|[^\sA-Za-z0-9_]/g);
  return tokens ? tokens.map((token) => token.toLowerCase()) : [];
}

function hashShingle(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function fingerprintCode(source: string): CodeFingerprint {
  const tokens = tokenizeCode(source);
  const shingles = new Set<number>();

  if (tokens.length >= SHINGLE_SIZE) {
    for (let index = 0; index <= tokens.length - SHINGLE_SIZE; index += 1) {
      shingles.add(hashShingle(tokens.slice(index, index + SHINGLE_SIZE).join(" ")));
    }
  }

  return { tokenCount: tokens.length, shingles };
}

/** 0–100, rounded to two decimals. Short or empty files compare as 0. */
export function similarityPercent(a: CodeFingerprint, b: CodeFingerprint): number {
  if (a.tokenCount < MIN_TOKENS || b.tokenCount < MIN_TOKENS) return 0;
  if (a.shingles.size === 0 || b.shingles.size === 0) return 0;

  const [small, large] =
    a.shingles.size <= b.shingles.size ? [a.shingles, b.shingles] : [b.shingles, a.shingles];

  let intersection = 0;
  for (const shingle of small) {
    if (large.has(shingle)) intersection += 1;
  }

  const union = a.shingles.size + b.shingles.size - intersection;
  if (union === 0) return 0;

  return Math.round((intersection / union) * 10000) / 100;
}

export function similarityBetweenSources(a: string, b: string): number {
  return similarityPercent(fingerprintCode(a), fingerprintCode(b));
}
