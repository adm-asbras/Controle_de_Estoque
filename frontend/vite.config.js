import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: {
      overlay: false
    },
    watch: {
      usePolling: true,
      interval: 150,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }
  }
})
