import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'

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

function loadConfig(): Record<string, string> {
  const configPath = join(homedir(), '.config/wt/config.json')
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch { return {} }
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

  const repoName = basename(repoRoot)
  const parentDir = dirname(repoRoot)

  // Check if we're in a worktree (not the main repo)
  const gitDir = exec('git rev-parse --git-dir')
  const isWorktree = gitDir.includes('.git/worktrees') || gitDir.includes('.git/.worktrees')

  let mainRepoPath: string
  let worktreesPath: string
  let mainRepoName: string

  if (isWorktree) {
    // We're in a worktree - find main repo from git dir
    // gitDir will be like /path/to/repo/.git/.worktrees/branch-name or /path/to/repo/.git/worktrees/branch-name
    const match = gitDir.match(/(.+)\/\.git\/\.?worktrees\//)
    if (match) {
      mainRepoPath = match[1]
      mainRepoName = basename(mainRepoPath)
      worktreesPath = join(mainRepoPath, '.git', '.worktrees')
    } else {
      // Legacy: sibling -worktrees folder
      const worktreesDir = dirname(repoRoot)
      const worktreesDirName = basename(worktreesDir)
      if (worktreesDirName.endsWith('-worktrees')) {
        mainRepoName = worktreesDirName.replace('-worktrees', '')
        mainRepoPath = join(dirname(worktreesDir), mainRepoName)
        worktreesPath = worktreesDir
      } else {
        throw new Error('Cannot determine main repo from worktree')
      }
    }
  } else {
    mainRepoName = repoName
    mainRepoPath = repoRoot
    worktreesPath = join(repoRoot, '.git', '.worktrees')
  }

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

  const config = loadConfig()
  const repoKey = `${owner}/${name}`
  if (config[repoKey]) {
    worktreesPath = config[repoKey].replace(/^~/, homedir())
  }

  const envPath = join(mainRepoPath, '.env')
  const hasEnv = existsSync(envPath)

  return { repoRoot, mainRepoPath, mainRepoName, worktreesPath, owner, name, defaultBranch, envPath: hasEnv ? envPath : null, cwd: process.cwd() }
}
