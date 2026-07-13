/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://mitosis.zenheart.site/',
      },
    },
    include: ['tests/unit/**/*.{spec,test}.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  define: {
    __GITHUB_CLIENT_ID__: JSON.stringify('test_client_id'),
    __GITHUB_REPO_OWNER__: JSON.stringify('testOwner'),
    __GITHUB_REPO_NAME__: JSON.stringify('testRepo'),
    __GITHUB_TOKEN__: JSON.stringify(''),
  },
})
