import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    wasm(),
    react(),
  ],
  server: {
    port: 3001,
    open: true,
    fs: {
      // Allow serving files from the SDK directory
      allow: ['..', '../..'],
    },
  },
  optimizeDeps: {
    exclude: ['@synckit-js/sdk'],
  },
  build: {
    target: 'esnext',
  },
})
