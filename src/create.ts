import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function execSafe(cmd: string, opts: { cwd?: string } = {}): string | null {
  try { return exec(cmd, opts) } catch { return null }
}

function getGitUser(): string | null {
  return execSafe('gh api user --jq .login')
}

function ensureFork(owner: string, name: string, cwd: string): string {
  const user = getGitUser()
  if (!user) throw new Error('Not logged in to gh')

  const forkExists = execSafe(`gh repo view ${user}/${name} --json name`) !== null
  if (!forkExists) {
    consola.start('Creating fork...')
    exec(`gh repo fork ${owner}/${name} --clone=false`)
  }

  const remotes = exec('git remote -v', { cwd })
  if (!remotes.includes('fork')) {
    exec(`git remote add fork https://github.com/${user}/${name}.git`, { cwd })
  }

  return user
}

export async function create(branch: string, ctx: Context): Promise<void> {
  if (!branch) {
    consola.error('Usage: wt create <branch>')
    process.exit(1)
  }

  const { mainRepoPath, worktreesPath, owner, name, defaultBranch, envPath } = ctx
  const user = getGitUser()

  if (!existsSync(worktreesPath)) {
    mkdirSync(worktreesPath, { recursive: true })
    consola.info(`Created worktrees dir: ${worktreesPath}`)
  }

  const worktreePath = join(worktreesPath, branch)

  if (existsSync(worktreePath)) {
    consola.error(`Worktree already exists: ${worktreePath}`)
    process.exit(1)
  }

  consola.start('Fetching latest...')
  exec(`git fetch origin ${defaultBranch}`, { cwd: mainRepoPath })

  consola.start(`Creating worktree: ${branch}`)
  exec(`git worktree add -b ${branch} "${worktreePath}" origin/${defaultBranch}`, { cwd: mainRepoPath })

  if (envPath) {
    const destEnv = join(worktreePath, '.env')
    copyFileSync(envPath, destEnv)
    consola.success('Copied .env')
  }

  let useFork = false
  consola.start('Pushing branch...')
  const pushResult = execSafe(`git push -u origin ${branch}`, { cwd: worktreePath })
  if (pushResult === null) {
    consola.warn('No push access, using fork...')
    ensureFork(owner, name, worktreePath)
    exec(`git push -u fork ${branch}`, { cwd: worktreePath })
    useFork = true
  }

  if (ctx.createPr) {
    consola.start('Creating draft PR...')
    try {
      const head = useFork ? `${user}:${branch}` : branch
      const prUrl = exec(`gh pr create --draft --title "${branch}" --body "" --head ${head} --repo ${owner}/${name}`, { cwd: worktreePath })
      consola.success(`Draft PR: ${prUrl}`)
    } catch {
      consola.warn('Failed to create PR (may already exist)')
    }
  }

  consola.success(`Worktree ready: ${worktreePath}`)

  if (ctx.issueUrl) {
    const prompt = `Investigate this issue and see how we can fix it: ${ctx.issueUrl}

Read ~/repros/CLAUDE.md to understand the workflow for bug reproductions and PRs.`

    consola.info('Launching Claude...')
    spawnSync('claude', ['--permission-mode', 'plan', '--allow-dangerously-skip-permissions', prompt], {
      cwd: worktreePath,
      stdio: 'inherit',
    })
  }

  spawnSync(process.env.SHELL || 'zsh', [], {
    cwd: worktreePath,
    stdio: 'inherit',
  })
}
