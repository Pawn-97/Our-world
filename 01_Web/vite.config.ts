import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'
// @ts-expect-error Node-only Vite plugin is intentionally kept outside the browser TypeScript project.
import { travelAtlasLocalEditor } from './scripts/local-editor-plugin.mjs'

// Milestone 6 — GitHub Pages project sites live under a sub-path
// (https://<user>.github.io/<repo>/). The deploy workflow passes
// BASE_PATH=/<repo>/; local dev and custom domains default to '/'.
// vite-plugin-cesium joins this base into CESIUM_BASE_URL, and the media
// service prefixes it onto absolute /media/... URLs, so every asset resolves
// under the sub-path.
const normalizeBasePath = (value: string | undefined): string => {
  const trimmed = (value ?? '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: normalizeBasePath(process.env.BASE_PATH),
  plugins: [travelAtlasLocalEditor(), react(), tailwindcss(), cesium()],
  server: {
    watch: {
      ignored: [
        '**/public/media/user/**',
        // The local editor writes content/*.json through the dev middleware;
        // ignore those writes so Vite does not trigger a full-page reload
        // (the app refreshes repositories explicitly after each save).
        '**/content/**',
      ],
    },
  },
})
