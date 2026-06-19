import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'

const _env = loadEnv('production', process.cwd(), [''])

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    __GITHUB_CLIENT_ID__: JSON.stringify(_env.VITE_GITHUB_CLIENT_ID || ''),
  },
})
