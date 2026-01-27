import { execSync, spawnSync } from 'node:child_process'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export interface Worktree { path: string, branch: string }

export function getWorktrees(ctx: Context): Worktree[] {
  const output = exec('git worktree list --porcelain', { cwd: ctx.mainRepoPath })
  const lines = output.split('\n')
  const worktrees: Worktree[] = []
  let current: Partial<Worktree & { bare?: boolean }> = {}

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path && current.branch) worktrees.push({ path: current.path, branch: current.branch })
      current = { path: line.replace('worktree ', '') }
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch refs/heads/', '')
    } else if (line === 'bare') {
      current.bare = true
    }
  }
  if (current.path && current.branch && !current.bare) worktrees.push({ path: current.path, branch: current.branch })

  return worktrees.filter(w => w.path !== ctx.mainRepoPath)
}

// fzf picker returning selected worktree path
export function pickWorktree(ctx: Context): string | null {
  const wts = getWorktrees(ctx)
  if (wts.length === 0) return null

  const choices = wts.map(w => `${w.branch}\t${w.path}`)
  const result = spawnSync('fzf', ['--header=Select worktree', '--delimiter=\t', '--with-nth=1'], {
    input: choices.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'],
  })

  if (result.status !== 0 || !result.stdout?.trim()) return null
  const [, path] = result.stdout.trim().split('\t')
  return path
}

interface PR { headRefName: string, number: number, statusCheckRollup?: { conclusion: string }[] }

export async function list(ctx: Context): Promise<void> {
  const { mainRepoPath } = ctx
  const wts = getWorktrees(ctx)

  if (wts.length === 0) {
    consola.info('No worktrees')
    return
  }

  consola.start('Fetching PR statuses...')
  let prs: PR[] = []
  try {
    const prsJson = exec('gh pr list --json headRefName,number,statusCheckRollup --limit 100', { cwd: mainRepoPath })
    prs = JSON.parse(prsJson)
  } catch {}

  const prByBranch = new Map(prs.map(pr => [pr.headRefName, pr]))

  console.log('')
  for (const wt of wts) {
    const pr = prByBranch.get(wt.branch)
    const status = !pr ? '(no PR)'
      : !pr.statusCheckRollup?.length ? `#${pr.number} ?`
      : pr.statusCheckRollup.every(c => c.conclusion === 'SUCCESS') ? `#${pr.number} ✓`
      : pr.statusCheckRollup.some(c => c.conclusion === 'FAILURE') ? `#${pr.number} ✗`
      : `#${pr.number} …`

    console.log(`  ${wt.branch.padEnd(40)} ${status.padEnd(15)} ${wt.path}`)
  }
  console.log('')
}
