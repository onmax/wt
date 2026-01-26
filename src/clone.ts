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

export async function cloneWorktree(ctx: Context, branch: string, prompt?: string): Promise<void> {
  const { mainRepoPath, worktreesPath, envPath } = ctx

  if (!existsSync(worktreesPath)) {
    mkdirSync(worktreesPath, { recursive: true })
  }

  const worktreePath = join(worktreesPath, branch)

  if (existsSync(worktreePath)) {
    consola.warn(`Worktree already exists: ${worktreePath}`)
    spawnSync(process.env.SHELL || 'zsh', [], { cwd: worktreePath, stdio: 'inherit' })
    return
  }

  consola.start(`Fetching branch: ${branch}`)
  exec(`git fetch origin ${branch}`, { cwd: mainRepoPath })

  consola.start(`Creating worktree: ${branch}`)
  const branchExists = execSafe(`git rev-parse --verify ${branch}`, { cwd: mainRepoPath }) !== null
  if (branchExists) {
    exec(`git worktree add "${worktreePath}" ${branch}`, { cwd: mainRepoPath })
  } else {
    exec(`git worktree add --track -b ${branch} "${worktreePath}" origin/${branch}`, { cwd: mainRepoPath })
  }

  if (envPath) {
    const destEnv = join(worktreePath, '.env')
    copyFileSync(envPath, destEnv)
    consola.success('Copied .env')
  }

  consola.success(`Worktree ready: ${worktreePath}`)

  if (prompt) {
    consola.info('Launching Claude...')
    spawnSync('claude', ['--permission-mode', 'plan', '--allow-dangerously-skip-permissions', prompt], {
      cwd: worktreePath,
      stdio: 'inherit',
    })
  }

  spawnSync(process.env.SHELL || 'zsh', [], { cwd: worktreePath, stdio: 'inherit' })
}

export async function clone(ctx: Context): Promise<void> {
  const { mainRepoPath, owner, name } = ctx

  consola.start('Fetching open PRs...')
  const prsJson = exec('gh pr list --json number,title,headRefName --limit 50', { cwd: mainRepoPath })
  const prs = JSON.parse(prsJson) as { number: number, title: string, headRefName: string }[]

  if (prs.length === 0) {
    consola.info('No open PRs found')
    return
  }

  const choices = prs.map(pr => `#${pr.number}\t${pr.headRefName}\t${pr.title}`)
  const fzfInput = choices.join('\n')

  const result = spawnSync('fzf', ['--header=Select PR to clone', '--delimiter=\t', '--with-nth=1,3'], {
    input: fzfInput,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  if (result.status !== 0 || !result.stdout?.trim()) {
    consola.info('Cancelled')
    return
  }

  const selected = result.stdout.trim()
  const [prNum, branch] = selected.split('\t')
  const prNumber = prNum.replace('#', '')
  const prUrl = `https://github.com/${owner}/${name}/pull/${prNumber}`

  await cloneWorktree(ctx, branch, `Continue working on: ${prUrl}`)
}
