import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json,geojson}'], maximumFileSizeToCacheInBytes: 25 * 1024 * 1024 },
      manifest: {
        name: 'NYC Affordable Housing Map',
        short_name: 'HomeMap',
        description: 'Find NYC areas and affordable housing that match your income.',
        theme_color: '#1f6f5c',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
      }
    })
  ]
});
