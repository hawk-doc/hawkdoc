import type { RangeSelection } from 'lexical';
import { $isLinkNode } from '@lexical/link';
import type { SelectionFormat } from '../interfaces';

export const EMPTY_FORMAT: SelectionFormat = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  code: false,
  link: false,
};

/** What the toolbar and the bubble menu show as active for a selection */
export function $readSelectionFormat(selection: RangeSelection): SelectionFormat {
  const anchorNode = selection.anchor.getNode();
  return {
    bold: selection.hasFormat('bold'),
    italic: selection.hasFormat('italic'),
    underline: selection.hasFormat('underline'),
    strikethrough: selection.hasFormat('strikethrough'),
    code: selection.hasFormat('code'),
    link: $isLinkNode(anchorNode.getParent()),
  };
}

/** Compares all inline format flags so callers can retain unchanged selection state. */
export function sameFormat(a: SelectionFormat, b: SelectionFormat): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.code === b.code &&
    a.link === b.link
  );
}
