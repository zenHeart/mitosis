import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const GITHUB_CLIENT_ID = process.env.VITE_GITHUB_CLIENT_ID || ''
const GITHUB_REPO_OWNER = process.env.VITE_GITHUB_REPO_OWNER || 'zenHeart'
const GITHUB_REPO_NAME = process.env.VITE_GITHUB_REPO_NAME || 'mitosis'

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    __GITHUB_CLIENT_ID__: JSON.stringify(GITHUB_CLIENT_ID),
    __GITHUB_REPO_OWNER__: JSON.stringify(GITHUB_REPO_OWNER),
    __GITHUB_REPO_NAME__: JSON.stringify(GITHUB_REPO_NAME),
  },
})
