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
  const isWorktree = repoName.includes('-worktrees') || !existsSync(join(repoRoot, '.git'))

  let mainRepoPath: string
  let worktreesPath: string
  let mainRepoName: string

  if (repoName.endsWith('-worktrees')) {
    mainRepoName = repoName.replace('-worktrees', '')
    mainRepoPath = join(parentDir, mainRepoName)
    worktreesPath = repoRoot
  } else if (isWorktree) {
    const worktreesDir = dirname(repoRoot)
    const worktreesDirName = basename(worktreesDir)
    if (worktreesDirName.endsWith('-worktrees')) {
      mainRepoName = worktreesDirName.replace('-worktrees', '')
      mainRepoPath = join(dirname(worktreesDir), mainRepoName)
      worktreesPath = worktreesDir
    } else {
      throw new Error('Cannot determine main repo from worktree')
    }
  } else {
    mainRepoName = repoName
    mainRepoPath = repoRoot
    worktreesPath = join(parentDir, `${repoName}-worktrees`)
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

  return {
    repoRoot,
    mainRepoPath,
    mainRepoName,
    worktreesPath,
    owner,
    name,
    defaultBranch,
    envPath: hasEnv ? envPath : null,
    cwd: process.cwd(),
  }
}
