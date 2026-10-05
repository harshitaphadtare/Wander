import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // MapLibre alone is ~1 MB; it's precached by the service worker, so one big chunk is fine.
  build: { chunkSizeWarningLimit: 1600 },
  // MapLibre's worker is an ES module.
  worker: { format: 'es' },
  // Lets `npx cloudflared tunnel` give the dev server an https URL for testing on your phone.
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Wander',
        short_name: 'Wander',
        description: 'Your personal explore map: log places, find favourites, wander further.',
        theme_color: '#f4f2ee',
        background_color: '#f4f2ee',
        display: 'standalone',
        orientation: 'portrait',
        // The installed app opens on the map (or sign-in), never the marketing page.
        start_url: '/app',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // MapLibre is large; let it into the precache so the map works offline.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Style JSON, sprites and glyphs change rarely: serve cached, refresh in background.
            urlPattern: ({ url }) =>
              url.origin === 'https://tiles.openfreemap.org' && !url.pathname.includes('/planet/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ofm-style',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Vector tiles: keep recently viewed areas available offline.
            urlPattern: ({ url }) =>
              url.origin === 'https://tiles.openfreemap.org' && url.pathname.includes('/planet/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ofm-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
