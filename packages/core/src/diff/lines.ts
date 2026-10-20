/** Small text utilities for the diff engine. */

const norm = (s: string): string[] => s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

/** Dice similarity of the two texts' non-empty trimmed line multisets, 0..1. Identical texts give exactly 1. */
export function lineSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const A = norm(a), B = norm(b);
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const l of A) counts.set(l, (counts.get(l) ?? 0) + 1);
  let common = 0;
  for (const l of B) { const n = counts.get(l) ?? 0; if (n > 0) { common++; counts.set(l, n - 1); } }
  return (2 * common) / (A.length + B.length);
}

/**
 * 0-based indices of lines in `head` that are not in `base` (as a multiset of trimmed lines): the added or changed lines.
 * If `base` is undefined every line counts as added.
 */
export function addedLineIndexes(base: string | undefined, head: string): Set<number> {
  const out = new Set<number>();
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  if (base === undefined) { lines.forEach((_l, i) => out.add(i)); return out; }
  const counts = new Map<string, number>();
  for (const l of base.replace(/\r\n/g, "\n").split("\n")) { const t = l.trim(); counts.set(t, (counts.get(t) ?? 0) + 1); }
  lines.forEach((l, i) => {
    const t = l.trim();
    const n = counts.get(t) ?? 0;
    if (n > 0 && t !== "") counts.set(t, n - 1);
    else if (t !== "") out.add(i);
  });
  return out;
}

export function withContext(indexes: Set<number>, context: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const i of indexes) for (let d = -context; d <= context; d++) { const j = i + d; if (j >= 0 && j < max) out.add(j); }
  return out;
}
