import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  envDir: __dirname,
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'og-preview.png'],
      manifest: {
        name: 'GST Billing Pro',
        short_name: 'GST Billing Pro',
        description: 'India\'s smartest cloud GST billing software. Tax invoices, GSTR-1/3B, multi-business, PDF, WhatsApp share. Free 30-day trial.',
        theme_color: '#1e40af',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        start_url: '/',
        scope: '/',
        orientation: 'any',
        lang: 'en-IN',
        categories: ['business', 'productivity', 'finance'],
        shortcuts: [
          {
            name: 'New Invoice',
            short_name: 'New Invoice',
            description: 'Create a new tax invoice',
            url: '/?view=new',
            icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'See invoices and stats',
            url: '/?view=dashboard',
            icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
        ],
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: [
          '**/assets/pdf-*.js',
          '**/assets/qr-*.js',
          '**/assets/index.es-*.js',
          '**/tesseract/**',
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Don't cache Supabase API calls
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//, /^\/(terms|privacy|refund|contact|kirana|medical-shop|printing-press|textile|hardware|restaurant|vyapar-alternative|mybillbook-alternative)(\.html)?$/, /^\/(sitemap\.xml|robots\.txt)$/],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // NOTE: Supabase (auth / REST / storage) responses are deliberately
          // NOT cached by the service worker. Caching them served stale
          // subscription status and could leak one user's data to the next
          // person who signs in on a shared shop counter PC.
          {
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/assets\/(pdf|qr|index\.es)-[A-Za-z0-9]+\.js$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lazy-chunks-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Same-origin static images only (never user logos from storage)
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'pdf': ['jspdf', 'html2canvas'],
          'icons': ['lucide-react'],
          'qr': ['qrcode'],
        },
      },
    },
  },
  // No proxy needed — Supabase is called directly from the browser
  // Cloudflare Pages Functions handle /api/* routes for payment
})
