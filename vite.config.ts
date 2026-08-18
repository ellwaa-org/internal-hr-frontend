import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET

  if (command === 'serve' && !apiTarget) {
    throw new Error(
      'Missing VITE_API_PROXY_TARGET. Copy .env.example to .env and set the API host.',
    )
  }

  const proxy = apiTarget
    ? {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
      }
    : undefined

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    server: { proxy },
    preview: { proxy },
  }
})
