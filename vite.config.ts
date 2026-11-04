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
            // matrix-js-sdk — самый крупный vendor; maxSize дробит его на
            // куски <500 kB (снимает предупреждение Vite), кэшируются независимо
            { name: 'matrix', test: /node_modules[\\/]matrix-js-sdk[\\/]/, maxSize: 450_000 },
            // react + router меняются редко — отдельно от кода приложения
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
