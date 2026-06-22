import js from '@eslint/js'
import globals from 'globals'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const baseRules = {
  ...js.configs.recommended.rules,
  ...tsPlugin.configs.recommended.rules,
  'no-undef': 'off',
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-namespace': 'warn',
  '@typescript-eslint/no-var-requires': 'warn',
  'no-case-declarations': 'off',
  'no-empty': 'warn',
  'no-extra-semi': 'warn',
  'no-unreachable': 'warn',
  'no-constant-condition': 'warn',
  'no-useless-escape': 'warn',
  'no-inner-declarations': 'warn',
  'no-unexpected-multiline': 'warn',
  'no-self-assign': 'warn',
  'no-async-promise-executor': 'warn',
}

const reactRules = {
  ...reactHooks.configs.recommended.rules,
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  'react-hooks/rules-of-hooks': 'warn',
  'react-hooks/exhaustive-deps': 'warn',
}

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'streets-gl-alt/**',
      'coverage/**',
      '**/*.cjs',
      'scripts/**',
      'server.js',
      'server-revit-sync/**',
      'files-upload/**',
      'docs/**',
      '*.js',
      'electron/**',
      'tests/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...baseRules,
      ...reactRules,
    },
  },
  {
    files: ['playwright.config.ts', 'vitest.config.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: baseRules,
  },
]
