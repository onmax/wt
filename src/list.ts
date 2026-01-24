import { execSync } from 'node:child_process'
import { basename } from 'node:path'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

interface Worktree { path: string, branch?: string, bare?: boolean }
interface PR { headRefName: string, number: number, statusCheckRollup?: { conclusion: string }[] }

export async function list(ctx: Context): Promise<void> {
  const { mainRepoPath } = ctx

  const output = exec('git worktree list --porcelain', { cwd: mainRepoPath })
  const lines = output.split('\n')

  const worktrees: Worktree[] = []
  let current: Partial<Worktree> = {}

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current as Worktree)
      current = { path: line.replace('worktree ', '') }
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch refs/heads/', '')
    } else if (line === 'bare') {
      current.bare = true
    }
  }
  if (current.path) worktrees.push(current as Worktree)

  const wts = worktrees.filter(w => !w.bare && w.branch)

  if (wts.length === 0) {
    consola.info('No worktrees found')
    return
  }

  consola.start('Fetching PR statuses...')
  let prs: PR[] = []
  try {
    const prsJson = exec('gh pr list --json headRefName,number,state,statusCheckRollup,mergeable --limit 100', { cwd: mainRepoPath })
    prs = JSON.parse(prsJson)
  } catch {
    // Ignore if we can't fetch PRs
  }

  const prByBranch = new Map(prs.map(pr => [pr.headRefName, pr]))

  console.log('')
  for (const wt of wts) {
    const pr = prByBranch.get(wt.branch!)
    const checkStatus = !pr ? '(no PR)'
      : !pr.statusCheckRollup?.length ? `#${pr.number} ?`
      : pr.statusCheckRollup.every(c => c.conclusion === 'SUCCESS') ? `#${pr.number} ✓`
      : pr.statusCheckRollup.some(c => c.conclusion === 'FAILURE') ? `#${pr.number} ✗`
      : `#${pr.number} …`

    console.log(`  ${wt.branch!.padEnd(40)} ${checkStatus.padEnd(15)} ${wt.path}`)
  }
  console.log('')
}
