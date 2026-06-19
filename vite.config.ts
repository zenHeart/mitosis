import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const GITHUB_CLIENT_ID = process.env.VITE_GITHUB_CLIENT_ID || ''

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    __GITHUB_CLIENT_ID__: JSON.stringify(GITHUB_CLIENT_ID),
  },
})
