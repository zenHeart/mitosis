declare const __GITHUB_REPO_OWNER__: string
declare const __GITHUB_REPO_NAME__: string

export const REPO_OWNER = __GITHUB_REPO_OWNER__ || 'zenHeart'
export const REPO_NAME = __GITHUB_REPO_NAME__ || 'mitosis'
export const REPO_FULL_NAME = `${REPO_OWNER}/${REPO_NAME}`

export function userRepoFullName(userLogin: string): string {
  return `${userLogin}/${REPO_NAME}`
}
