import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // matrix-js-sdk — самый крупный vendor; отдельный chunk для кэширования.
            // НЕ дробить через maxSize: это режет циклически связанные модули SDK
            // и ломает TDZ (PushRuleKind.Override undefined при загрузке /auth).
            { name: 'matrix', test: /node_modules[\\/]matrix-js-sdk[\\/]/ },
            // react + router меняются редко — отдельно от кода приложения
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
