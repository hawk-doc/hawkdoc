import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin';

interface Props {
  anchorElem: HTMLElement;
}

export function DraggableBlockPlugin({ anchorElem }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={
        <div ref={menuRef} className="drag-handle">
          <GripVertical size={14} />
        </div>
      }
      targetLineComponent={<div ref={targetLineRef} className="drag-target-line" />}
      isOnMenu={(el) => !!menuRef.current?.contains(el)}
    />
  );
}
