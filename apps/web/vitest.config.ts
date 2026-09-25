import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
  define: {
    // Components read this at module load; tests never reach the network
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.test'),
    'import.meta.env.VITE_WS_URL': JSON.stringify('ws://api.test'),
  },
});
