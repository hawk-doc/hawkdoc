import { useEffect, useState } from 'react';
import { $getRoot, type LexicalEditor } from 'lexical';

// Counting words walks every node in the document, so the figure follows
// typing at a readable pace instead of at the speed of the keyboard.
const STATS_DEBOUNCE_MS = 400;

const WORDS_PER_MINUTE = 200;

function countWords(editor: LexicalEditor): number {
  const text = editor.getEditorState().read(() => $getRoot().getTextContent()).trim();
  return text ? text.split(/\s+/).length : 0;
}

function readingTime(words: number): string | null {
  if (words === 0) return null;
  const minutes = words / WORDS_PER_MINUTE;
  return minutes < 1 ? '< 1 min read' : `${Math.ceil(minutes)} min read`;
}

/**
 * The word count and reading time beneath the page.
 *
 * It subscribes to the editor rather than taking the document as a prop: the
 * editor state changes with every keystroke, and passing it down from the
 * editor would re-render the toolbar and everything else alongside this one
 * line of text. Here only this component re-renders, and only once typing
 * pauses.
 */
export function DocumentStats({ editor }: { editor: LexicalEditor | null }) {
  const [words, setWords] = useState(0);

  useEffect(() => {
    if (!editor) return;
    setWords(countWords(editor));

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      // Moving the caret cannot change the count
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        setWords(countWords(editor));
      }, STATS_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unregister();
    };
  }, [editor]);

  const time = readingTime(words);

  return (
    <span className="text-xs text-[#80868b] dark:text-[#5f6368]">
      {words} {words === 1 ? 'word' : 'words'}
      {time && <> · {time}</>}
    </span>
  );
}
