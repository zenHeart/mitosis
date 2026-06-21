import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

const GITHUB_CLIENT_ID = process.env.VITE_GITHUB_CLIENT_ID || ''
const GITHUB_REPO_OWNER = process.env.VITE_GITHUB_REPO_OWNER || 'zenHeart'
const GITHUB_REPO_NAME = process.env.VITE_GITHUB_REPO_NAME || 'mitosis'
const GITHUB_TOKEN = process.env.VITE_GITHUB_TOKEN || process.env.GITHUB_MCP_PAT || ''
const PROJECT_ROOT = process.cwd()

// Vite plugin: serve apps/* 构建产物
// 在 dev server 上拦截 /apps/{name}/v{n}/ 路径，返回生成应用的 dist 文件
function appDistPlugin() {
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }

  return {
    name: 'app-dist-server',
    configureServer(server) {
      console.log('[app-dist-plugin] configureServer called!')

      server.middlewares.use((req, res, next) => {
        const url = req.url || ''

        // 只处理 /apps/{name}/v{n}/ 路径
        const match = url.match(/^\/apps\/([^/]+)\/v(\d+)\/(.*)$/)
        if (!match) return next()

        const [, appName, , suffix] = match
        const versionMatch = url.match(/\/v(\d+)\//)
        const version = versionMatch ? versionMatch[1] : '1'
        const distDir = path.join(PROJECT_ROOT, 'apps', appName, `v${version}`, 'dist')

        if (!fs.existsSync(distDir)) {
          console.log(`[app-dist-plugin] dist not found: ${distDir}`)
          return next()
        }

        // 构造文件路径
        const filePath = suffix ? suffix.replace(/^\//, '') : 'index.html'
        const fullPath = path.join(distDir, filePath)

        // 安全检查
        if (!fullPath.startsWith(distDir)) {
          return next()
        }

        // 如果是目录，尝试提供 index.html
        let targetPath = fullPath
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
          targetPath = path.join(targetPath, 'index.html')
        }

        if (fs.existsSync(targetPath)) {
          res.setHeader('Content-Type', contentTypes[path.extname(targetPath)] || 'application/octet-stream')
          res.statusCode = 200
          const content = fs.readFileSync(targetPath)
          console.log(`[app-dist-plugin] serving ${path.relative(PROJECT_ROOT, targetPath)} (${content.length} bytes)`)
          res.end(content)
        } else {
          // fallback 到 index.html
          const indexPath = path.join(distDir, 'index.html')
          if (fs.existsSync(indexPath)) {
            res.setHeader('Content-Type', 'text/html')
            res.statusCode = 200
            res.end(fs.readFileSync(indexPath))
          } else {
            next()
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), appDistPlugin()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    __GITHUB_CLIENT_ID__: JSON.stringify(GITHUB_CLIENT_ID),
    __GITHUB_REPO_OWNER__: JSON.stringify(GITHUB_REPO_OWNER),
    __GITHUB_REPO_NAME__: JSON.stringify(GITHUB_REPO_NAME),
    __GITHUB_TOKEN__: JSON.stringify(GITHUB_TOKEN),
  },
  server: {
    proxy: {
      '/api/github/': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/github/, ''),
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      },
    },
  },
})
