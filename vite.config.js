import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  define: {
    global: 'globalThis',
    __BACKEND_URL__: JSON.stringify(process.env.VITE_BACKEND_URL || 'http://192.168.1.203:3000'),
    __APP_VARIANT__: JSON.stringify(process.env.VITE_APP_VARIANT || 'full'),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/renderer') }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: { port: 5173 }
})
