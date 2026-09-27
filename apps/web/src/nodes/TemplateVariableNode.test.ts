import { describe, it, expect } from 'vitest';
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { EDITOR_NODES, EDITOR_THEME } from '../constants/editor';
import { $createTemplateVariableNode, $isTemplateVariableNode } from './TemplateVariableNode';

function editorWithVariable() {
  const editor = createEditor({
    namespace: 'HawkDoc',
    nodes: EDITOR_NODES,
    theme: EDITOR_THEME,
    onError: (error: Error) => { throw error; },
  });
  editor.update(() => {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode('Hello '), $createTemplateVariableNode('customer_name'));
    $getRoot().append(paragraph);
  }, { discrete: true });
  return editor;
}

describe('TemplateVariableNode', () => {
  it('survives the round trip autosave and the exporters depend on', () => {
    const editor = editorWithVariable();

    // Every save and export starts here; a throwing exportJSON loses the
    // document rather than the variable.
    const saved = JSON.stringify(editor.getEditorState().toJSON());
    expect(saved).toContain('customer_name');

    const reopened = editorWithVariable();
    reopened.setEditorState(reopened.parseEditorState(saved));
    reopened.getEditorState().read(() => {
      const [paragraph] = $getRoot().getChildren();
      const variable = (paragraph as ReturnType<typeof $createParagraphNode>).getChildren()[1];
      expect($isTemplateVariableNode(variable)).toBe(true);
      expect(variable && $isTemplateVariableNode(variable) ? variable.getVariableName() : null)
        .toBe('customer_name');
    });
  });
});
