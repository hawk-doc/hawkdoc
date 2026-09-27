import { describe, it, expect } from 'vitest';
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type SerializedEditorState,
  type SerializedElementNode,
  type SerializedTextNode,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $createListNode, $createListItemNode } from '@lexical/list';
import { $createLinkNode } from '@lexical/link';
import * as Y from 'yjs';
import { editorStateFromYjsUpdate, VersionDecodeError } from './decode';
import { $createTemplateVariableNode } from '../../nodes/TemplateVariableNode';
import { yjsUpdateFor } from '../../test/collab';

function children(state: SerializedEditorState): SerializedElementNode['children'] {
  return (state.root as SerializedElementNode).children;
}

function textNodes(node: unknown): SerializedTextNode[] {
  const element = node as SerializedElementNode;
  if (!element.children) return [];
  return element.children.flatMap((child) =>
    (child as SerializedTextNode).type === 'text'
      ? [child as SerializedTextNode]
      : textNodes(child),
  );
}

describe('editorStateFromYjsUpdate', () => {
  it('rebuilds headings, paragraphs and text formatting', () => {
    const update = yjsUpdateFor(() => {
      const heading = $createHeadingNode('h2');
      heading.append($createTextNode('Quarterly report'));
      const paragraph = $createParagraphNode();
      const bold = $createTextNode('important');
      bold.setFormat('bold');
      const italic = $createTextNode('aside');
      italic.setFormat('italic');
      paragraph.append($createTextNode('An '), bold, $createTextNode(' and an '), italic);
      $getRoot().append(heading, paragraph);
    });

    const state = editorStateFromYjsUpdate(update);
    const [heading, paragraph] = children(state);

    expect(heading).toMatchObject({ type: 'heading', tag: 'h2' });
    expect(textNodes(heading)[0]!.text).toBe('Quarterly report');

    const runs = textNodes(paragraph);
    expect(runs.map((run) => run.text)).toEqual(['An ', 'important', ' and an ', 'aside']);
    expect(runs.find((run) => run.text === 'important')!.format).toBe(1);
    expect(runs.find((run) => run.text === 'aside')!.format).toBe(2);
  });

  it('keeps lists, quotes and links', () => {
    const update = yjsUpdateFor(() => {
      const list = $createListNode('bullet');
      const first = $createListItemNode();
      first.append($createTextNode('step one'));
      const second = $createListItemNode();
      const link = $createLinkNode('https://example.test/docs');
      link.append($createTextNode('step two'));
      second.append(link);
      list.append(first, second);

      const quote = $createQuoteNode();
      quote.append($createTextNode('as noted'));
      $getRoot().append(list, quote);
    });

    const state = editorStateFromYjsUpdate(update);
    const [list, quote] = children(state);

    expect(list).toMatchObject({ type: 'list', listType: 'bullet' });
    expect((list as SerializedElementNode).children).toHaveLength(2);
    expect(textNodes(list).map((node) => node.text)).toEqual(['step one', 'step two']);

    const link = (list as SerializedElementNode).children
      .flatMap((item) => (item as SerializedElementNode).children)
      .find((node) => (node as { type: string }).type === 'link');
    expect(link).toMatchObject({ url: 'https://example.test/docs' });

    expect(quote).toMatchObject({ type: 'quote' });
    expect(textNodes(quote)[0]!.text).toBe('as noted');
  });

  it('keeps template variables as nodes rather than plain text', () => {
    const update = yjsUpdateFor(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('Hello '), $createTemplateVariableNode('customer_name'));
      $getRoot().append(paragraph);
    });

    const state = editorStateFromYjsUpdate(update);
    const nodes = (children(state)[0] as SerializedElementNode).children;
    expect(nodes[1]).toMatchObject({ type: 'template-variable', variableName: 'customer_name' });
  });

  it('reads an empty document as an empty root', () => {
    const state = editorStateFromYjsUpdate(yjsUpdateFor(() => {}));
    expect(children(state)).toEqual([]);
  });

  it('reflects a deletion made after the earlier content', () => {
    // A version's state is the merge of every delta before it, so a deleted
    // paragraph must stay deleted rather than reappearing in the merge.
    const first = yjsUpdateFor(() => {
      const keep = $createParagraphNode();
      keep.append($createTextNode('keep this'));
      const drop = $createParagraphNode();
      drop.append($createTextNode('remove this'));
      $getRoot().append(keep, drop);
    });

    const doc = new Y.Doc();
    Y.applyUpdate(doc, first);
    // Delete the second paragraph the way a collaborator would
    const root = doc.get('root', Y.XmlText);
    root.delete(1, 1);
    const afterDelete = Y.encodeStateAsUpdate(doc);

    const state = editorStateFromYjsUpdate(Y.mergeUpdates([first, afterDelete]));
    expect(children(state)).toHaveLength(1);
    expect(textNodes(children(state)[0]).map((node) => node.text)).toEqual(['keep this']);
  });

  it('rejects an update it cannot read', () => {
    expect(() => editorStateFromYjsUpdate(new Uint8Array([9, 9, 9, 9, 9]))).toThrow(VersionDecodeError);
  });
});
