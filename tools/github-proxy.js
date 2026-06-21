#!/usr/bin/env node
/**
 * tools/github-proxy.js — GitHub API 本地代理
 *
 * 解决本地网络不通 api.github.com 的问题。
 * 浏览器 → localhost:5174 → (走系统代理) → api.github.com
 *
 * 用法: node tools/github-proxy.js
 * 环境变量:
 *   GITHUB_MCP_PAT 或 VITE_GITHUB_TOKEN — GitHub API token
 */

import http from 'http'
import https from 'https'
import { URL } from 'url'

const PORT = 5174
const TOKEN = process.env.VITE_GITHUB_TOKEN || process.env.GITHUB_MCP_PAT || ''

if (!TOKEN) {
  console.error('ERROR: 需要 GITHUB_MCP_PAT 或 VITE_GITHUB_TOKEN 环境变量')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  if (!req.url?.startsWith('/')) {
    res.writeHead(400)
    res.end('Bad request')
    return
  }

  console.log(`[proxy] ${req.method} ${req.url}`)

  // 移除头部代理标识
  delete req.headers['host']

  const githubUrl = `https://api.github.com${req.url}`
  const url = new URL(githubUrl)

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mitosis-local-proxy/1.0',
      Host: url.hostname,
    },
  }

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error(`[proxy] ${req.method} ${req.url} → ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502)
      res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }))
    }
  })

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq)
  } else {
    proxyReq.end()
  }
})

server.listen(PORT, () => {
  console.log(`[github-proxy] http://localhost:${PORT} → https://api.github.com`)
  console.log(`[github-proxy] token: ${TOKEN.slice(0, 10)}...`)
})
