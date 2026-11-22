import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createEditor } from 'lexical';
import type { ReactElement } from 'react';
import { ImageNode, $createImageNode } from './ImageNode';

vi.mock('@lexical/react/useLexicalNodeSelection', () => ({
  useLexicalNodeSelection: () => [false, vi.fn(), vi.fn()],
}));
vi.mock('../hooks/useDeleteOnSelection', () => ({ useDeleteOnSelection: vi.fn() }));

function decorate(src: string): ReactElement {
  const editor = createEditor({ nodes: [ImageNode], onError: (e) => { throw e; } });
  let el: ReactElement | null = null;
  editor.update(() => { el = $createImageNode(src, 'pic').decorate(editor); }, { discrete: true });
  if (!el) throw new Error('decorate returned nothing');
  return el;
}

describe('ImageNode', () => {
  it('marks a broken image with classes, not inline styles', () => {
    const { container } = render(decorate('/uploads/missing.png'));
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('title')).toBeNull();

    fireEvent.error(img);

    expect(img.getAttribute('style')).toBeNull();
    expect(img.className).toContain('opacity-40');
    expect(img.className).toContain('grayscale');
    expect(img.getAttribute('title')).toBe('Image failed to load');
    expect(img.dataset.failed).toBe('true');
  });

  it('clears the failed state when the image later loads', () => {
    const { container } = render(decorate('/uploads/slow.png'));
    const img = container.querySelector('img') as HTMLImageElement;

    fireEvent.error(img);
    fireEvent.load(img);

    expect(img.className).not.toContain('opacity-40');
    expect(img.getAttribute('title')).toBeNull();
    expect(img.dataset.failed).toBeUndefined();
  });
});
