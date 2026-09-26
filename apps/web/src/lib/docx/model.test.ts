import { describe, it, expect } from 'vitest';
import { toBlocks, type Block } from './model';
import type { EditorRoot } from '../../components/DocumentPDF';

// Shapes here mirror Lexical's serialised state (editorState.toJSON())
const state = (...children: unknown[]) => ({ root: { children } }) as unknown as EditorRoot;
const text = (t: string, format = 0) => ({ type: 'text', text: t, format });
const para = (...children: unknown[]) => ({ type: 'paragraph', children });

describe('document model', () => {
  it('keeps headings with their level', () => {
    const blocks = toBlocks(state(
      { type: 'heading', tag: 'h1', children: [text('Title')] },
      { type: 'heading', tag: 'h3', children: [text('Sub')] },
    ));
    expect(blocks).toEqual<Block[]>([
      { kind: 'heading', level: 1, runs: [{ text: 'Title' }] },
      { kind: 'heading', level: 3, runs: [{ text: 'Sub' }] },
    ]);
  });

  it('decodes the inline format bitmask per run', () => {
    const blocks = toBlocks(state(para(
      text('plain'),
      text('bold', 1),
      text('italic', 2),
      text('both', 3),
      text('struck', 4),
      text('underlined', 8),
      text('code', 16),
    )));
    expect(blocks[0]).toEqual<Block>({
      kind: 'paragraph',
      runs: [
        { text: 'plain' },
        { text: 'bold', bold: true },
        { text: 'italic', italic: true },
        { text: 'both', bold: true, italic: true },
        { text: 'struck', strikethrough: true },
        { text: 'underlined', underline: true },
        { text: 'code', code: true },
      ],
    });
  });

  it('carries a link down to the runs inside it', () => {
    const blocks = toBlocks(state(para(
      text('see '),
      { type: 'link', url: 'https://example.test', children: [text('the docs', 1)] },
    )));
    expect(blocks[0]).toEqual<Block>({
      kind: 'paragraph',
      runs: [
        { text: 'see ' },
        { text: 'the docs', bold: true, href: 'https://example.test' },
      ],
    });
  });

  it('flattens nested lists, keeping depth and numbering', () => {
    const blocks = toBlocks(state({
      type: 'list',
      listType: 'bullet',
      children: [
        { type: 'listitem', children: [text('one')] },
        {
          type: 'listitem',
          children: [
            text('two'),
            { type: 'list', listType: 'number', children: [{ type: 'listitem', children: [text('nested')] }] },
          ],
        },
      ],
    }));
    expect(blocks).toEqual<Block[]>([
      { kind: 'listItem', ordered: false, level: 0, runs: [{ text: 'one' }] },
      { kind: 'listItem', ordered: false, level: 0, runs: [{ text: 'two' }] },
      { kind: 'listItem', ordered: true, level: 1, runs: [{ text: 'nested' }] },
    ]);
  });

  it('keeps a parent with no text above its nested list', () => {
    expect(toBlocks(state({
      type: 'list', listType: 'bullet', children: [{
        type: 'listitem', children: [{
          type: 'list', listType: 'number', children: [{ type: 'listitem', children: [text('nested')] }],
        }],
      }],
    }))).toEqual<Block[]>([
      { kind: 'listItem', ordered: false, level: 0, runs: [] },
      { kind: 'listItem', ordered: true, level: 1, runs: [{ text: 'nested' }] },
    ]);
  });

  it('exports template variables as their placeholder', () => {
    const blocks = toBlocks(state(para(text('Hi '), { type: 'template-variable', variableName: 'name' })));
    expect(blocks[0]).toEqual<Block>({ kind: 'paragraph', runs: [{ text: 'Hi ' }, { text: '{{name}}' }] });
  });

  it('keeps code blocks, dividers, page breaks and images', () => {
    const blocks = toBlocks(state(
      { type: 'code', children: [text('const a = 1;')] },
      { type: 'horizontalrule' },
      { type: 'page-break' },
      { type: 'image', src: '/uploads/a.png', altText: 'A picture' },
    ));
    expect(blocks).toEqual<Block[]>([
      { kind: 'code', text: 'const a = 1;' },
      { kind: 'divider' },
      { kind: 'pageBreak' },
      { kind: 'image', src: '/uploads/a.png', alt: 'A picture' },
    ]);
  });

  it('keeps table cells and marks header cells', () => {
    const blocks = toBlocks(state({
      type: 'table',
      children: [
        { type: 'tablerow', children: [
          { type: 'tablecell', headerState: 1, children: [para(text('Name'))] },
          { type: 'tablecell', headerState: 0, children: [para(text('Value'))] },
        ] },
      ],
    }));
    expect(blocks).toEqual<Block[]>([
      { kind: 'table', rows: [{ cells: [
        { runs: [{ text: 'Name' }], header: true },
        { runs: [{ text: 'Value' }], header: false },
      ] }] },
    ]);
  });

  it('drops empty text but keeps empty paragraphs as spacing', () => {
    const blocks = toBlocks(state(para(text('')), para(text('after'))));
    expect(blocks).toEqual<Block[]>([
      { kind: 'paragraph', runs: [] },
      { kind: 'paragraph', runs: [{ text: 'after' }] },
    ]);
  });

  it('keeps the text of a node type it does not know', () => {
    const blocks = toBlocks(state({ type: 'something-new', children: [text('still here')] }));
    expect(blocks).toEqual<Block[]>([{ kind: 'paragraph', runs: [{ text: 'still here' }] }]);
  });
});
