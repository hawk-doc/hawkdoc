/** One search hit inside a text node */
export interface Match {
  nodeKey: string;
  start: number;
  end: number;
  matchIndex: number;
}

/** Where a single Replace happened, so the next search hit can be picked after it */
export interface ReplacedAt {
  nodeKey: string;
  /** Offset just past the inserted text */
  offset: number;
  /** Hits that came before the replaced one in earlier text nodes */
  hitsInEarlierNodes: number;
}

/**
 * Index of the first hit after a replacement. Without this the current index
 * stays put, so when the replacement still matches (e.g. "a" -> "A" ignoring
 * case, or "foo" -> "foobar") Replace keeps hitting the same text.
 * Hits are in document order and each node's hits are contiguous, so earlier
 * nodes keep their count and only the replaced node's hits need recounting.
 */
export function indexAfterReplace(found: Match[], at: ReplacedAt): number {
  if (found.length === 0) return 0;
  const beforeInNode = found.filter(
    (m) => m.nodeKey === at.nodeKey && m.start < at.offset,
  ).length;
  return (at.hitsInEarlierNodes + beforeInNode) % found.length;
}
