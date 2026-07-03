export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
  name?: string
}

export interface AuthState {
  user: GitHubUser | null
  token: string | null
  isAuthenticated: boolean
  setupComplete: boolean
  _oauthProcessing: boolean
  oauthError: string | null
}
