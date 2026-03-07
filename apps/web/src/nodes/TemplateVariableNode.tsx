import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { type ReactNode } from 'react';

export type SerializedTemplateVariableNode = Spread<
  { variableName: string; type: 'template-variable'; version: 1 },
  SerializedLexicalNode
>;

export class TemplateVariableNode extends DecoratorNode<ReactNode> {
  __variableName: string;

  static getType(): string {
    return 'template-variable';
  }

  static clone(node: TemplateVariableNode): TemplateVariableNode {
    return new TemplateVariableNode(node.__variableName, node.__key);
  }

  static importJSON(
    serializedNode: SerializedTemplateVariableNode,
  ): TemplateVariableNode {
    return new TemplateVariableNode(serializedNode.variableName);
  }

  constructor(variableName: string, key?: NodeKey) {
    super(key);
    this.__variableName = variableName;
  }

  exportJSON(): SerializedTemplateVariableNode {
    return {
      ...super.exportJSON(),
      type: 'template-variable',
      version: 1,
      variableName: this.__variableName,
    };
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'template-variable-wrapper';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getVariableName(): string {
    return this.__variableName;
  }

  decorate(): ReactNode {
    return (
      <span className="template-variable" title={`Variable: ${this.__variableName}`}>
        {'{{'}{this.__variableName}{'}}'}
      </span>
    );
  }

  isInline(): boolean {
    return true;
  }
}

export function $createTemplateVariableNode(
  variableName: string,
): TemplateVariableNode {
  return new TemplateVariableNode(variableName);
}

export function $isTemplateVariableNode(
  node: LexicalNode | null | undefined,
): node is TemplateVariableNode {
  return node instanceof TemplateVariableNode;
}
