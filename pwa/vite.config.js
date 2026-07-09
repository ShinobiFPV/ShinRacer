import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      // manifest.json already ships hand-written in public/ (Phase 10 spec's
      // exact shortcuts/icons shape) — injectManifest via `strategies: 'injectManifest'`
      // isn't needed since we're not hand-rolling a service worker; `generateSW`
      // (the default) still respects public/manifest.json as-is and just adds
      // precaching + the update flow on top of it.
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png', 'offline.html'],
      workbox: {
        // App shell + JS/CSS bundles: cache-first (vite fingerprints filenames,
        // so a stale cache entry just means an old build, never wrong content).
        globPatterns: ['**/*.{js,css,html}'],
        runtimeCaching: [
          {
            // Google Fonts — long-TTL cache-first, same policy the spec calls for.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // API calls: network-first, falling back to the last cached response
            // when offline. Socket.io's own long-lived polling/websocket requests
            // are excluded below since they can't meaningfully be cached anyway.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/mods/download'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
          },
        ],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/auth\/callback/],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': 'http://192.168.1.203:3000',
      '/socket.io': { target: 'http://192.168.1.203:3000', ws: true },
    },
  },
})
