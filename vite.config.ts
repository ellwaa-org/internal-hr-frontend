import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Local proxy; production nginx uses the same upstream origin setting.
  const apiTarget = env.API_PROXY_TARGET || 'https://hr-api.ellwaa.com'

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
    server: { port: Number(env.VITE_DEV_SERVER_PORT) || 5174, proxy },
    preview: { port: Number(env.VITE_DEV_SERVER_PORT) || 5174, proxy },
  }
})
