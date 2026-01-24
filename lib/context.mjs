import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { homedir } from 'os'

function loadConfig() {
  const configPath = join(homedir(), '.config/wt/config.json')
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch { return {} }
}

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

export async function getContext() {
  // Get git root
  let repoRoot
  try {
    repoRoot = exec('git rev-parse --show-toplevel')
  } catch {
    throw new Error('Not in a git repository')
  }

  const repoName = basename(repoRoot)
  const parentDir = dirname(repoRoot)

  // Detect if we're in a worktree or main repo
  const isWorktree = repoName.includes('-worktrees') || existsSync(join(repoRoot, '.git')) === false

  // Derive main repo and worktrees paths
  let mainRepoPath, worktreesPath, mainRepoName

  if (repoName.endsWith('-worktrees')) {
    // We're in the worktrees directory itself (unlikely but handle it)
    mainRepoName = repoName.replace('-worktrees', '')
    mainRepoPath = join(parentDir, mainRepoName)
    worktreesPath = repoRoot
  } else if (isWorktree) {
    // We're inside a worktree - parent is *-worktrees folder
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
    // We're in the main repo
    mainRepoName = repoName
    mainRepoPath = repoRoot
    worktreesPath = join(parentDir, `${repoName}-worktrees`)
  }

  // Get repo info from GitHub
  let owner, name, defaultBranch
  try {
    const json = exec(`gh repo view --json owner,name,defaultBranchRef`)
    const data = JSON.parse(json)
    owner = data.owner.login
    name = data.name
    defaultBranch = data.defaultBranchRef.name
  } catch {
    throw new Error('Failed to get repo info from GitHub')
  }

  // Check for custom worktree path in config
  const config = loadConfig()
  const repoKey = `${owner}/${name}`
  if (config[repoKey]) {
    worktreesPath = config[repoKey].replace(/^~/, homedir())
  }

  // Find .env in main repo
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
