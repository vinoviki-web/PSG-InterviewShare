import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const src = (p) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const databaseBuild = (process.env.VITE_DATA_SOURCE ?? env.VITE_DATA_SOURCE) === 'supabase'
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        // Database builds never contain the prototype's fictional data (DECISIONS LA2).
        ...(databaseBuild ? [{ find: /^@\/mocks\/(db|seed)$/, replacement: src('mocks/stub.js') }] : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    build: {
      sourcemap: false,
    },
  }
})
