import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export interface Context {
  repoRoot: string
  mainRepoPath: string
  mainRepoName: string
  worktreesPath: string
  owner: string
  name: string
  defaultBranch: string
  envPath: string | null
  cwd: string
  createPr?: boolean
  issueUrl?: string
}

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

export async function getContext(): Promise<Context> {
  let repoRoot: string
  try {
    repoRoot = exec('git rev-parse --show-toplevel')
  } catch {
    throw new Error('Not in a git repository')
  }

  // Bare repo pattern: look for repo.git/ in parent
  const parentDir = dirname(repoRoot)
  const bareGitPath = join(parentDir, 'repo.git')

  if (!existsSync(bareGitPath)) {
    throw new Error('Not a wt repo. Use `wt init <url>` to create one.')
  }

  const mainRepoPath = bareGitPath
  const worktreesPath = parentDir
  const mainRepoName = basename(parentDir)

  let owner: string
  let name: string
  let defaultBranch: string
  try {
    const json = exec('gh repo view --json owner,name,defaultBranchRef')
    const data = JSON.parse(json)
    owner = data.owner.login
    name = data.name
    defaultBranch = data.defaultBranchRef.name
  } catch {
    throw new Error('Failed to get repo info from GitHub')
  }

  const envPath = join(repoRoot, '.env')
  const hasEnv = existsSync(envPath)

  return { repoRoot, mainRepoPath, mainRepoName, worktreesPath, owner, name, defaultBranch, envPath: hasEnv ? envPath : null, cwd: process.cwd() }
}
