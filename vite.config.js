import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const src = (p) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const databaseBuild = (process.env.VITE_DATA_SOURCE ?? env.VITE_DATA_SOURCE) === 'supabase'

  // Safety net (DECISIONS LA8): every Vercel build (production and preview
  // links) must be the real app. Without VITE_DATA_SOURCE=supabase it would ship the prototype, where
  // anyone can "sign in" with the demo code. Fail loudly instead.
  // (VITE_PROTOTYPE=1 deliberately allows a hosted prototype demo.)
  const prototypeAllowed = (process.env.VITE_PROTOTYPE ?? env.VITE_PROTOTYPE) === '1'
  if (process.env.VERCEL === '1' && !databaseBuild && !prototypeAllowed) {
    throw new Error('Vercel build without VITE_DATA_SOURCE=supabase. Add it (and VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) in Vercel → Settings → Environment Variables.')
  }
  if (databaseBuild && !(process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL)) {
    throw new Error('VITE_DATA_SOURCE=supabase needs VITE_SUPABASE_URL.')
  }
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
