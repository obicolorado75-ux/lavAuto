import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // shadcn/ui files export variants and hooks next to their components by design
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Contextes d'application : le couple <Provider> + useXxx() est le pattern
    // idiomatique React (auth, permissions, confirmations, abonnements…). Le
    // hook exporté à côté du composant n'est pas une dette : c'est l'API du
    // module. On accepte l'avertissement sur ces fichiers précis plutôt que de
    // fragmenter les contextes en trois fichiers chacun.
    files: [
      'src/lib/auth.tsx',
      'src/lib/confirm.tsx',
      'src/lib/notifications.tsx',
      'src/lib/permissions.tsx',
      'src/lib/subscription.tsx',
      'src/console/auth.tsx',
      'src/components/search-context.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // react-hook-form : `watch()` est une API non mémoïsable, le React Compiler
    // (eslint-plugin-react-hooks v7) signale donc ces modales "Compilation
    // Skipped". C'est un comportement ATTENDU et sûr ici : les modales sont des
    // feuilles de rendu re-montées à chaque ouverture, jamais mémoïsées par un
    // parent (pas de risque de UI obsolète). La migration watch() -> useWatch()
    // est suivie séparément ; en attendant, on documente l'exception plutôt que
    // de brider la règle globalement.
    files: ['src/components/modals/**/*.tsx'],
    rules: {
      'react-hooks/incompatible-library': 'off',
    },
  },
])
