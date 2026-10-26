import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mediaStoragePlugin, aiProxyPlugin } from './server/mediaBackend.js'

const ALLOWED_HOSTS = [
  'videomontageeditor.thisoftcore.com',
  ...(process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',') : []),
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mediaStoragePlugin(), aiProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      ignored: [
        '**/release/**',
        '**/dist/**',
        '**/dist_electron/**',
        '**/.git/**',
        '**/build-resources/**',
        '**/*.vproj'
      ]
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
  },
})
