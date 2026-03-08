import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist', 'node_modules'] },

  js.configs.recommended,

  // All TypeScript + React source files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // TypeScript handles undefined references — no-undef produces false
      // positives for JSX globals, React types, and module augmentations.
      'no-undef': 'off',

      // Use the TS-aware version instead of the base rule
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',

      // React hooks
      ...reactHooks.configs.recommended.rules,

      // React refresh (Vite HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Lexical node files export classes + helper functions alongside components.
  // react-refresh/only-export-components is a HMR hint, not meaningful here.
  {
    files: ['src/nodes/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
];
