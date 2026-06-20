import type { GitHubUser } from '../types/auth'
import { REPO_NAME } from '../config/repo'

// @ts-ignore - injected at build time via vite define
// eslint-disable-next-line no-undef
const GITHUB_CLIENT_ID = __GITHUB_CLIENT_ID__
const REDIRECT_URI = `${window.location.origin}/auth/callback`

// Cloudflare Worker proxy URL — exchanges authorization code for access token
// This is required because GitHub's /login/oauth/access_token does not support CORS
const OAUTH_PROXY_URL = 'https://mitosis-oauth-proxy.zenheart1991.workers.dev'

// 开发模式：走 Vite proxy（解决本地网络不通问题）
const IS_DEV = import.meta.env.DEV
const API_BASE = IS_DEV ? '/api/github' : 'https://api.github.com'

// ---- OAuth URLs ----

export function getLoginUrl(): string {
  return `https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read:user repo workflow',
    allow_signup: 'true',
    response_type: 'code',
  }).toString()}`
}

// ---- Token Exchange (via Cloudflare Worker proxy) ----

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string }> {
  const res = await fetch(OAUTH_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Token exchange failed' }))
    throw new Error(err.error || err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ---- User API ----

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`)
  }
  return res.json()
}

export async function verifyRepoOwnership(
  token: string,
  userLogin: string
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/repos/${userLogin}/${REPO_NAME}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (res.status === 404) return false
  if (!res.ok) return false
  const repo = await res.json()
  return repo.owner.login === userLogin
}

export function saveSession(token: string, user: GitHubUser): void {
  sessionStorage.setItem('mitosis_token', token)
  sessionStorage.setItem('mitosis_user', JSON.stringify(user))
}

export function clearSession(): void {
  sessionStorage.clear()
  localStorage.removeItem('mitosis_setup_complete')
}
