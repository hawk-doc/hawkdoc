// Declares Node.js globals that live in iCloud-placeholder web-globals/*.d.ts files.
// These are re-declared here so TypeScript can find them without those files being present locally.

declare var console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

declare function setInterval(callback: (...args: unknown[]) => void, ms?: number): NodeJS.Timeout;
declare function clearInterval(id?: NodeJS.Timeout): void;
declare function setTimeout(callback: (...args: unknown[]) => void, ms?: number): NodeJS.Timeout;
declare function clearTimeout(id?: NodeJS.Timeout): void;
