// Module augmentation for ioredis — adds Commander methods whose .d.ts files are iCloud placeholders.
// The `export {}` makes this a module file so the declaration below is a MODULE AUGMENTATION
// (merges with ioredis's actual types) rather than an ambient declaration (which would replace them).
export {};

declare module 'ioredis' {
  interface Redis {
    keys(pattern: string): Promise<string[]>;
    getBuffer(key: string): Promise<Buffer | null>;
    set(key: string, value: string | Buffer): Promise<string>;
    del(...keys: string[]): Promise<number>;
  }
}
