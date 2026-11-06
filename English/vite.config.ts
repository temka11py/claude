import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const apiPort = Number(process.env.PORT ?? 3001);

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Fluent Path — English B1 → C1',
        short_name: 'Fluent Path',
        description: 'Your personal English course from B1 to C1.',
        theme_color: '#4f46e5',
        background_color: '#0b1020',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Review cards and the word bank stay usable offline once loaded.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/review/queue') ||
              url.pathname.startsWith('/api/vocab') ||
              url.pathname.startsWith('/api/dashboard'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-offline',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
});
