import { useCallback, useRef } from 'react';
import { CollaborationPlugin as LexicalCollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import type { Provider } from '@lexical/yjs';
import { useAuth } from '../context/AuthContext';
import { INVALID_TOKEN_REASON } from '../constants/auth';

const WS_URL = import.meta.env.VITE_WS_URL;

export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

const CURSOR_COLORS = ['#F24822', '#0ACF83', '#1ABCFE', '#A259FF', '#FF7262', '#00B4D8'];

function getCursorColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

interface CollaborationPluginProps {
  docId: string;
  token: string;
  username: string;
  userId: string;
  onStatus?: (status: CollabStatus) => void;
  onProvider?: (provider: HocuspocusProvider | null) => void;
}

export function CollaborationPlugin({
  docId,
  token,
  username,
  userId,
  onStatus,
  onProvider,
}: CollaborationPluginProps) {
  const cursorsContainerRef = useRef<HTMLDivElement>(null);
  const { expireSession } = useAuth();

  const providerFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
      const doc = new Y.Doc();
      yjsDocMap.set(id, doc);

      onStatus?.('connecting');

      const provider = new HocuspocusProvider({
        url: WS_URL,
        name: id,
        document: doc,
        token,
        onConnect: () => onStatus?.('connected'),
        onDisconnect: () => onStatus?.('disconnected'),
        onSynced: ({ state }) => {
          onStatus?.('connected');
          // Lexical bootstraps an empty document on the provider's `sync`
          // event (y-websocket's name); Hocuspocus calls it `synced`.
          (provider as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit('sync', state);
        },
        onAuthenticationFailed: ({ reason }) => {
          onStatus?.('disconnected');
          // Only a rejected token ends the session. `permission-denied` means
          // this document can't be opened, and the user stays signed in.
          if (reason === INVALID_TOKEN_REASON) expireSession(token);
        },
      });

      onProvider?.(provider);

      return provider as unknown as Provider;
    },
    // providerFactory must be stable for the lifetime of the editor session —
    // recreating it causes the plugin to reconnect. We intentionally exclude
    // `onStatus` / `onProvider` from deps since they are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docId, token, expireSession],
  );

  return (
    <>
      {/* Cursor overlay — absolutely covers the editor content area */}
      <div
        ref={cursorsContainerRef}
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      />
      <LexicalCollaborationPlugin
        id={docId}
        providerFactory={providerFactory}
        // The first client to open an empty document creates its initial
        // paragraph in Yjs; without it there's nothing for edits to attach to.
        shouldBootstrap
        username={username}
        cursorColor={getCursorColor(userId)}
        cursorsContainerRef={cursorsContainerRef as React.MutableRefObject<HTMLElement | null>}
      />
    </>
  );
}
