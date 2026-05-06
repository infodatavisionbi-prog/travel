import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appVersion =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  String(Date.now())

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fuel-app-version',
      transformIndexHtml(html) {
        return html.replaceAll('__APP_VERSION__', appVersion)
      },
    },
  ],
  define: {
    __FUEL_APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 3000,
    headers: noStoreHeaders,
  },
  preview: {
    headers: noStoreHeaders,
  },
  build: { outDir: 'dist' },
})
