import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * True while an input method (IME) is composing text, e.g. Japanese, Chinese
 * or Korean input. Enter and Escape in that state confirm or cancel the
 * composition, so they must not also submit or close the surrounding UI.
 * Safari reports the composition-ending keydown with only keyCode 229.
 * Accepts both React synthetic events and native DOM keyboard events.
 */
export function isComposingKey(e: ReactKeyboardEvent | KeyboardEvent): boolean {
  const isComposing = 'nativeEvent' in e ? e.nativeEvent.isComposing : e.isComposing;
  return isComposing || e.keyCode === 229;
}
