import type { GitHubUser } from '../types/auth'

// @ts-ignore - injected at build time via vite define
// eslint-disable-next-line no-undef
const GITHUB_CLIENT_ID = __GITHUB_CLIENT_ID__
const REDIRECT_URI = `${window.location.origin}/auth/callback`

export function getLoginUrl(): string {
  return `https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read:user repo workflow',
    allow_signup: 'true',
  }).toString()}`
}

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

export function extractTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace('#', '?'))
  return params.get('access_token')
}
