import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export interface Context {
  repoRoot: string
  mainRepoPath: string
  mainRepoName: string
  worktreesPath: string
  owner: string
  name: string
  defaultBranch: string
  propagatePatterns: string[]
  cwd: string
  createPr?: boolean
  issueUrl?: string
}

function exec(cmd: string, opts?: { cwd?: string }): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function execSafe(cmd: string, opts?: { cwd?: string }): string | null {
  try { return exec(cmd, opts) }
  catch { return null }
}

export async function getContext(): Promise<Context> {
  let repoRoot: string | undefined
  let worktreesPath: string | undefined
  let mainRepoPath: string | undefined

  // First: check if cwd has repo.git (in container directory)
  const cwdBareGit = join(process.cwd(), 'repo.git')
  if (existsSync(cwdBareGit)) {
    worktreesPath = process.cwd()
    mainRepoPath = cwdBareGit
    repoRoot = join(worktreesPath, 'main')
    if (!existsSync(repoRoot)) {
      throw new Error('Main worktree not found')
    }
  }
  else {
    // Second: try git rev-parse (we're in a worktree)
    const gitRoot = execSafe('git rev-parse --show-toplevel')
    if (gitRoot) {
      const parentDir = dirname(gitRoot)
      const bareGitPath = join(parentDir, 'repo.git')

      if (existsSync(bareGitPath)) {
        repoRoot = gitRoot
        mainRepoPath = bareGitPath
        worktreesPath = parentDir
      }
      else {
        throw new Error('Not a wt repo. Use `wt init <url>` to create one.')
      }
    }
    else {
      // Third: walk up looking for repo.git (in container but not worktree)
      let dir = process.cwd()
      let found = false
      while (dir !== dirname(dir)) {
        const bareGitPath = join(dir, 'repo.git')
        if (existsSync(bareGitPath)) {
          mainRepoPath = bareGitPath
          worktreesPath = dir
          repoRoot = join(dir, 'main')
          if (!existsSync(repoRoot)) {
            throw new Error('Main worktree not found')
          }
          found = true
          break
        }
        dir = dirname(dir)
      }
      if (!found) {
        throw new Error('Not a wt repo. Use `wt init <url>` to create one.')
      }
    }
  }

  if (!repoRoot || !worktreesPath || !mainRepoPath) {
    throw new Error('Failed to determine repository paths')
  }
  const mainRepoName = basename(worktreesPath)

  let owner: string
  let name: string
  let defaultBranch: string
  try {
    const json = exec('gh repo view --json owner,name,defaultBranchRef', { cwd: repoRoot })
    const data = JSON.parse(json)
    owner = data.owner.login
    name = data.name
    defaultBranch = data.defaultBranchRef.name
  }
  catch {
    throw new Error('Failed to get repo info from GitHub')
  }

  const propagatePath = join(worktreesPath, '.wt-propagate')
  const propagatePatterns = existsSync(propagatePath)
    ? readFileSync(propagatePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    : []

  return { repoRoot, mainRepoPath, mainRepoName, worktreesPath, owner, name, defaultBranch, propagatePatterns, cwd: process.cwd() }
}
