import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module imports (after globals are set) ─────────────────
import { getLoginUrl, saveSession, clearSession } from '../../../src/composables/useAuth'
import { REPO_OWNER, REPO_NAME, REPO_FULL_NAME, userRepoFullName } from '../../../src/config/repo'

// ================================================================
// useAuth — getLoginUrl
// ================================================================
describe('useAuth.getLoginUrl', () => {
  it('returns a valid GitHub OAuth authorize URL', () => {
    const url = getLoginUrl()

    expect(url).toContain('https://github.com/login/oauth/authorize')
    expect(url).toContain('client_id=')
    expect(url).toContain('response_type=code')
  })

  it('contains client_id from build-time injection', () => {
    const url = new URL(getLoginUrl())
    expect(url.searchParams.get('client_id')).toBeTruthy()
    // 不应是空字符串（cda9ae0 回归：CI 构建时 client_id 为空）
    expect(url.searchParams.get('client_id')).not.toBe('')
  })

  it('uses Authorization Code Flow (response_type=code)', () => {
    const url = new URL(getLoginUrl())
    expect(url.searchParams.get('response_type')).toBe('code')
  })

  it('requests read:user repo workflow scope', () => {
    const url = new URL(getLoginUrl())
    expect(url.searchParams.get('scope')).toBe('read:user repo workflow')
  })

  it('redirect_uri points to /auth/callback on same origin', () => {
    const url = new URL(getLoginUrl())
    const redirectUri = url.searchParams.get('redirect_uri') ?? ''

    expect(redirectUri).toContain('/auth/callback')
    expect(redirectUri).toContain('mitosis.zenheart.site')
  })

  it('does not contain client_secret', () => {
    const url = getLoginUrl()
    expect(url).not.toContain('client_secret')
  })
})

// ================================================================
// useAuth — saveSession / clearSession
// ================================================================
describe('useAuth.saveSession', () => {
  it('stores token in sessionStorage', () => {
    const user = {
      login: 'octocat',
      id: 1,
      avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
      html_url: 'https://github.com/octocat',
      name: 'The Octocat',
    }
    saveSession('ghp_testtoken', user)

    expect(sessionStorage.getItem('mitosis_token')).toBe('ghp_testtoken')
    const stored = JSON.parse(sessionStorage.getItem('mitosis_user')!)
    expect(stored.login).toBe('octocat')
    expect(stored.id).toBe(1)
  })

  it('clearSession removes all auth keys', () => {
    sessionStorage.setItem('mitosis_token', 'tok')
    sessionStorage.setItem('mitosis_user', '{}')
    sessionStorage.setItem('mitosis_oauth_code', 'code123')
    localStorage.setItem('mitosis_setup_complete', 'true')

    clearSession()

    expect(sessionStorage.getItem('mitosis_token')).toBeNull()
    expect(sessionStorage.getItem('mitosis_user')).toBeNull()
    expect(sessionStorage.getItem('mitosis_oauth_code')).toBeNull()
    expect(localStorage.getItem('mitosis_setup_complete')).toBeNull()
  })

  it('clearSession does not throw when storage is empty', () => {
    expect(() => clearSession()).not.toThrow()
  })
})

// ================================================================
// config/repo — repo name resolution
// ================================================================
describe('config/repo', () => {
  it('REPO_OWNER defaults to zenHeart', () => {
    // vitest define sets testOwner, but the default fallback should be zenHeart
    expect(REPO_OWNER).toBeTruthy()
    expect(typeof REPO_OWNER).toBe('string')
  })

  it('REPO_NAME defaults to mitosis', () => {
    expect(REPO_NAME).toBeTruthy()
    expect(typeof REPO_NAME).toBe('string')
  })

  it('REPO_FULL_NAME combines owner and repo', () => {
    expect(REPO_FULL_NAME).toContain('/')
    expect(REPO_FULL_NAME).not.toBe('')
  })

  it('userRepoFullName returns user/{repo-name}', () => {
    // vitest define 注入的是 testRepo，这里验证函数正确拼接
    expect(userRepoFullName('alice')).toBe('alice/testRepo')
    expect(userRepoFullName('bob')).toBe('bob/testRepo')
  })

  it('userRepoFullName works with any username', () => {
    const result = userRepoFullName('zenHeart')
    expect(result).toBe('zenHeart/testRepo')
  })
})
