import { useState } from 'react';
import { MAX_BLOCKS } from '../lib/versions/diff';
import type { DiffBlock, DiffRun, VersionDiff as Diff } from '../lib/versions/diff';

/**
 * Renders what changed between two versions.
 *
 * Deliberately not the editor: this is a reading view of a comparison, so it
 * uses <ins> and <del> rather than Lexical nodes. Every marker is text as well
 * as colour — a diff that only works in colour doesn't work for everyone.
 */

const MAX_CONTEXT = 2;

interface VersionDiffProps {
  diff: Diff;
  /** Shown when the two versions are the same */
  identicalMessage: string;
}

const BLOCK_STYLES: Record<DiffBlock['status'], string> = {
  added: 'border-l-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10',
  removed: 'border-l-2 border-red-400 bg-red-50/60 dark:bg-red-500/10',
  changed: 'border-l-2 border-amber-400 bg-amber-50/60 dark:bg-amber-500/10',
  unchanged: 'border-l-2 border-transparent',
};

const MARKERS: Record<DiffBlock['status'], { symbol: string; label: string } | null> = {
  added: { symbol: '+', label: 'Added' },
  removed: { symbol: '−', label: 'Removed' },
  changed: { symbol: '±', label: 'Edited' },
  unchanged: null,
};

function Run({ run }: { run: DiffRun }) {
  if (run.status === 'added') {
    return (
      <ins className="rounded-sm bg-emerald-200/70 px-0.5 no-underline dark:bg-emerald-500/30">
        {run.text}
      </ins>
    );
  }
  if (run.status === 'removed') {
    return (
      <del className="rounded-sm bg-red-200/70 px-0.5 dark:bg-red-500/30">
        {run.text}
      </del>
    );
  }
  return <span>{run.text}</span>;
}

function Block({ block }: { block: DiffBlock }) {
  const marker = MARKERS[block.status];
  const isContext = block.status === 'unchanged';

  return (
    <div className={`flex gap-2 rounded-r px-2 py-1.5 ${BLOCK_STYLES[block.status]}`}>
      <span
        aria-hidden="true"
        className="w-3 flex-shrink-0 select-none pt-0.5 text-center text-[13px] font-semibold text-notion-muted dark:text-[#9aa0a6]"
      >
        {marker?.symbol ?? ''}
      </span>
      <div className="min-w-0 flex-1">
        {marker && <span className="sr-only">{marker.label}: </span>}
        {(block.label || block.labelAfter) && (
          <span className="mr-1.5 rounded bg-black/5 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-notion-muted dark:bg-white/10 dark:text-[#9aa0a6]">
            {block.labelAfter ? `${block.label ?? '—'} → ${block.labelAfter}` : block.label}
          </span>
        )}
        <span
          className={`text-[13px] leading-relaxed ${
            isContext ? 'text-notion-muted dark:text-[#9aa0a6]' : 'text-notion-text dark:text-[#e8eaed]'
          }`}
        >
          {block.runs.length > 0
            ? block.runs.map((run, index) => <Run key={index} run={run} />)
            : <span className="italic opacity-60">Empty</span>}
        </span>
      </div>
    </div>
  );
}

/** A stretch of untouched blocks, folded away until someone wants the context */
function Context({ blocks }: { blocks: DiffBlock[] }) {
  const [shown, setShown] = useState(false);

  if (blocks.length <= MAX_CONTEXT || shown) {
    return <>{blocks.map((block) => <Block key={block.key} block={block} />)}</>;
  }

  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="my-1 w-full rounded px-2 py-1 text-left text-[11px] text-notion-muted transition-colors hover:bg-notion-hover dark:text-[#5f6368] dark:hover:bg-[#2d2f31]"
    >
      ··· {blocks.length} unchanged blocks — show
    </button>
  );
}

/**
 * Shown whenever a comparison stopped early — including when everything it did
 * compare matched, where "nothing changed" on its own would claim more than
 * the comparison can support.
 */
function TruncationNotice() {
  return (
    <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      This document is long enough that only its first {MAX_BLOCKS} blocks were compared.
    </p>
  );
}

function summarize(diff: Diff): string {
  const parts = [
    diff.added > 0 ? `${diff.added} added` : null,
    diff.removed > 0 ? `${diff.removed} removed` : null,
    diff.changed > 0 ? `${diff.changed} edited` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Consecutive untouched blocks travel together so they can be folded away */
function groupBlocks(blocks: DiffBlock[]): DiffBlock[][] {
  const groups: DiffBlock[][] = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    const isContext = block.status === 'unchanged';
    const lastIsContext = last?.[0]?.status === 'unchanged';
    if (last && isContext && lastIsContext) last.push(block);
    else groups.push([block]);
  }
  return groups;
}

export function VersionDiff({ diff, identicalMessage }: VersionDiffProps) {
  if (diff.isIdentical) {
    return (
      <>
        {diff.truncated && <TruncationNotice />}
        <p className="text-[13px] text-notion-muted dark:text-[#9aa0a6]">{identicalMessage}</p>
      </>
    );
  }

  return (
    <div aria-label="Changes" className="space-y-0.5">
      <p className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-notion-muted dark:text-[#5f6368]">
        {summarize(diff)}
      </p>

      {diff.truncated && <TruncationNotice />}

      {groupBlocks(diff.blocks).map((group) =>
        group[0]?.status === 'unchanged'
          ? <Context key={group[0].key} blocks={group} />
          : group.map((block) => <Block key={block.key} block={block} />),
      )}
    </div>
  );
}
