import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function clone(ctx: Context): Promise<void> {
  const { mainRepoPath, worktreesPath, envPath } = ctx

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
  const [, branch] = selected.split('\t')

  if (!existsSync(worktreesPath)) {
    mkdirSync(worktreesPath, { recursive: true })
  }

  const worktreePath = join(worktreesPath, branch)

  if (existsSync(worktreePath)) {
    consola.warn(`Worktree already exists: ${worktreePath}`)
    console.log(`\ncd ${worktreePath}`)
    return
  }

  consola.start(`Fetching branch: ${branch}`)
  exec(`git fetch origin ${branch}`, { cwd: mainRepoPath })

  consola.start(`Creating worktree: ${branch}`)
  exec(`git worktree add --track -b ${branch} "${worktreePath}" origin/${branch}`, { cwd: mainRepoPath })

  if (envPath) {
    const destEnv = join(worktreePath, '.env')
    copyFileSync(envPath, destEnv)
    consola.success('Copied .env')
  }

  consola.success(`Worktree ready: ${worktreePath}`)
  console.log(`\ncd ${worktreePath}`)
}
