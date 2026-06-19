import type { GitHubUser } from '../types/auth'

// @ts-ignore - injected at build time via vite define
// eslint-disable-next-line no-undef
const GITHUB_CLIENT_ID = __GITHUB_CLIENT_ID__
const REDIRECT_URI = `${window.location.origin}/auth/callback`

// ---- PKCE utilities ----

export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array.buffer)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(hash)
}

export function generateState(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ---- OAuth URLs ----

export function getLoginUrl(codeChallenge: string, state: string): string {
  return `https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read:user repo workflow',
    allow_signup: 'true',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  }).toString()}`
}

// ---- Token exchange ----

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
    }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`)
  }
  const data = await res.json()
  if (data.error) {
    throw new Error(data.error_description || data.error)
  }
  return data.access_token as string
}

// ---- User API ----

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
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
  const res = await fetch(`https://api.github.com/repos/${userLogin}/mitosis`, {
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
