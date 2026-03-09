// Ambient module declaration for @hocuspocus/server whose .d.ts files are iCloud placeholders.
// This REPLACES the broken module types so TypeScript can resolve Server, config, etc.

declare module '@hocuspocus/server' {
  interface HocuspocusCallbackData {
    token?: string;
    documentName: string;
    context: unknown;
    document: import('yjs').Doc;
  }

  interface HocuspocusConfig {
    port?: number;
    onAuthenticate?: (data: HocuspocusCallbackData) => Promise<unknown>;
    onLoadDocument?: (data: HocuspocusCallbackData) => Promise<void>;
    onChange?: (data: HocuspocusCallbackData) => Promise<void>;
    onDisconnect?: (data: HocuspocusCallbackData) => Promise<void>;
  }

  class Server {
    static configure(config: HocuspocusConfig): Server;
    listen(): void;
  }
}
