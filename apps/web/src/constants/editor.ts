import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { TemplateVariableNode } from '../nodes/TemplateVariableNode';
import { ImageNode } from '../nodes/ImageNode';
import type { BlockType } from '../types/editor';

export const TEMPLATE_VAR_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/;

export const EDITOR_THEME = {
  root: 'editor-content',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'editor-inline-code',
  },
  heading: { h1: 'editor-h1', h2: 'editor-h2', h3: 'editor-h3' },
  list: { ul: 'editor-ul', ol: 'editor-ol', listitem: 'editor-li' },
  quote: 'editor-quote',
  code: 'editor-code',
  link: 'editor-link',
};

export const EDITOR_NODES = [
  HeadingNode, QuoteNode,
  ListNode, ListItemNode,
  CodeNode, CodeHighlightNode,
  LinkNode, AutoLinkNode,
  HorizontalRuleNode,
  TemplateVariableNode,
  ImageNode,
];

export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'h1',        label: 'Heading 1' },
  { type: 'h2',        label: 'Heading 2' },
  { type: 'h3',        label: 'Heading 3' },
  { type: 'bullet',    label: 'Bullet list' },
  { type: 'number',    label: 'Numbered list' },
  { type: 'quote',     label: 'Quote' },
  { type: 'code',      label: 'Code block' },
];

export const FONT_FAMILIES: { label: string; css: string }[] = [
  { label: 'Inter',           css: 'Inter' },
  { label: 'Georgia',         css: 'Georgia' },
  { label: 'Times New Roman', css: '"Times New Roman"' },
  { label: 'Arial',           css: 'Arial' },
  { label: 'Courier New',     css: '"Courier New"' },
];

export const FONT_SIZES = [
  '8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72',
];
