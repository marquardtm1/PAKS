import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * Flat-Config (ESLint 9+). Schwerpunkt: Rules of Hooks — genau die Fehlerklasse,
 * die tsc/vite-build durchrutscht und erst zur Laufzeit als weiße Seite auffällt
 * (z. B. ein Hook nach einem frühen `return`). `react-hooks/rules-of-hooks` ist
 * daher `error` und lässt `npm run lint` fehlschlagen, bevor die App läuft.
 */
export default tseslint.config(
  { ignores: ['dist', 'edge-profile-tmp', 'design-referenz'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Underscore-Präfix markiert bewusst ungenutzte Bindings (z. B. Pflicht-
      // Parameter wie `_fromVersion`); echte ungenutzte Vars/Imports bleiben Fehler.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
)
