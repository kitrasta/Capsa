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
      globals: globals.browser,
    },
  },
  {
    // FSD-граница matrix-слоя: снаружи импортируем только публичный API
    // (src/shared/lib/matrix/index.ts), а не внутренние модули слоя
    files: ['src/**/*.{ts,tsx}', '!src/shared/lib/matrix/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/matrix/*'],
              message:
                'Импортируй matrix-слой только через публичный API: .../shared/lib/matrix',
            },
            {
              group: ['**/widgets/Chat/*'],
              message:
                'Импортируй виджет Chat только через его публичный API: .../widgets/Chat',
            },
          ],
        },
      ],
    },
  },
])
