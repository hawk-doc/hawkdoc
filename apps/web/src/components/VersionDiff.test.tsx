import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { VersionDiff } from './VersionDiff';
import type { DiffBlock, VersionDiff as Diff } from '../lib/versions/diff';

const block = (status: DiffBlock['status'], text: string, key: string): DiffBlock => ({
  key,
  kind: 'paragraph',
  label: null,
  labelAfter: null,
  status,
  runs: [{ text, status: status === 'changed' ? 'added' : status }],
});

function diff(partial: Partial<Diff>): Diff {
  return {
    blocks: [], added: 0, removed: 0, changed: 0, isIdentical: false, truncated: false,
    ...partial,
  };
}

const renderDiff = (value: Diff) =>
  render(createElement(VersionDiff, { diff: value, identicalMessage: 'Nothing changed.' }));

describe('VersionDiff', () => {
  it('says so when the two versions are the same', () => {
    renderDiff(diff({ isIdentical: true }));
    expect(screen.getByText('Nothing changed.')).toBeTruthy();
  });

  it('still warns about a partial comparison that found no differences', () => {
    // The first blocks matching says nothing about the ones never compared,
    // so "nothing changed" on its own would be a claim we cannot make.
    renderDiff(diff({ isIdentical: true, truncated: true }));

    expect(screen.getByText('Nothing changed.')).toBeTruthy();
    expect(screen.getByText(/only its first \d+ blocks were compared/)).toBeTruthy();
  });

  it('summarises what changed', () => {
    renderDiff(diff({
      added: 1, removed: 2, changed: 1,
      blocks: [block('added', 'new', 'a'), block('removed', 'gone', 'b')],
    }));

    expect(screen.getByText('1 added · 2 removed · 1 edited')).toBeTruthy();
  });

  it('marks insertions and deletions for a screen reader, not only in colour', () => {
    renderDiff(diff({
      added: 1, removed: 1,
      blocks: [block('added', 'inserted text', 'a'), block('removed', 'deleted text', 'b')],
    }));

    expect(document.querySelector('ins')?.textContent).toBe('inserted text');
    expect(document.querySelector('del')?.textContent).toBe('deleted text');
    expect(screen.getByText('Added:', { exact: false })).toBeTruthy();
    expect(screen.getByText('Removed:', { exact: false })).toBeTruthy();
  });

  it('folds away a long stretch of untouched blocks until asked', () => {
    renderDiff(diff({
      added: 1,
      blocks: [
        block('unchanged', 'one', 'u1'),
        block('unchanged', 'two', 'u2'),
        block('unchanged', 'three', 'u3'),
        block('unchanged', 'four', 'u4'),
        block('added', 'the new part', 'a1'),
      ],
    }));

    expect(screen.queryByText('three')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /4 unchanged blocks/ }));
    expect(screen.getByText('three')).toBeTruthy();
  });

  it('keeps a short stretch of context visible', () => {
    renderDiff(diff({
      added: 1,
      blocks: [block('unchanged', 'context', 'u1'), block('added', 'new', 'a1')],
    }));

    expect(screen.getByText('context')).toBeTruthy();
  });
});
