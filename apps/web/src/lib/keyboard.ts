import type { KeyboardEvent } from 'react';

/**
 * True while an input method (IME) is composing text, e.g. Japanese, Chinese
 * or Korean input. Enter and Escape in that state confirm or cancel the
 * composition, so they must not also submit or close the surrounding UI.
 * Safari reports the composition-ending keydown with only keyCode 229.
 */
export function isComposingKey(e: KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
