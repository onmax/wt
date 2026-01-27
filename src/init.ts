import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { consola } from 'consola'

function exec(cmd: string, opts?: { cwd?: string }): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function parseRepoName(url: string): string {
  // git@github.com:owner/repo.git → repo
  // https://github.com/owner/repo → repo
  const match = url.match(/[/:]([^/]+?)(\.git)?$/)
  return match?.[1] || 'repo'
}

export async function init(url: string, name?: string): Promise<void> {
  const repoName = name || parseRepoName(url)
  const containerPath = join(process.cwd(), repoName)
  const bareGitPath = join(containerPath, 'repo.git')

  if (existsSync(containerPath)) {
    consola.error(`Already exists: ${containerPath}`)
    process.exit(1)
  }

  mkdirSync(containerPath, { recursive: true })

  consola.start('Cloning bare repo...')
  exec(`git clone --bare "${url}" repo.git`, { cwd: containerPath })

  // Configure fetch refspec for remote tracking branches
  exec('git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"', { cwd: bareGitPath })
  exec('git fetch origin', { cwd: bareGitPath })

  // Get default branch
  const headRef = exec('git symbolic-ref HEAD', { cwd: bareGitPath })
  const defaultBranch = basename(headRef) // refs/heads/main → main

  consola.start(`Creating main worktree (${defaultBranch})...`)
  exec(`git worktree add ../main ${defaultBranch}`, { cwd: bareGitPath })

  const mainPath = join(containerPath, 'main')

  // Copy .env if exists in cwd
  const envPath = join(process.cwd(), '.env')
  if (existsSync(envPath)) {
    copyFileSync(envPath, join(mainPath, '.env'))
    consola.success('Copied .env')
  }

  // Install dependencies if package.json exists
  if (existsSync(join(mainPath, 'package.json'))) {
    consola.start('Installing dependencies...')
    spawnSync('ni', [], { cwd: mainPath, stdio: 'inherit' })
  }

  consola.success(`Ready: ${mainPath}`)
  spawnSync(process.env.SHELL || 'zsh', [], { cwd: mainPath, stdio: 'inherit' })
}
