import { execSync } from 'child_process'
import { basename } from 'path'
import { consola } from 'consola'

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function list(ctx) {
  const { mainRepoPath } = ctx

  // Get all worktrees
  const output = exec('git worktree list --porcelain', { cwd: mainRepoPath })
  const lines = output.split('\n')

  const worktrees = []
  let current = {}

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current)
      current = { path: line.replace('worktree ', '') }
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch refs/heads/', '')
    } else if (line === 'bare') {
      current.bare = true
    }
  }
  if (current.path) worktrees.push(current)

  // Filter out main repo (first entry is usually the main worktree)
  const wts = worktrees.filter(w => !w.bare && w.branch)

  if (wts.length === 0) {
    consola.info('No worktrees found')
    return
  }

  // Get PR statuses
  consola.start('Fetching PR statuses...')
  let prs = []
  try {
    const prsJson = exec(`gh pr list --json headRefName,number,state,statusCheckRollup,mergeable --limit 100`, { cwd: mainRepoPath })
    prs = JSON.parse(prsJson)
  } catch {
    // Ignore if we can't fetch PRs
  }

  const prByBranch = new Map(prs.map(pr => [pr.headRefName, pr]))

  console.log('')
  for (const wt of wts) {
    const pr = prByBranch.get(wt.branch)
    const dir = basename(wt.path)

    let status = '(no PR)'
    if (pr) {
      const checks = pr.statusCheckRollup || []
      const checkStatus = checks.length === 0 ? '?' :
        checks.every(c => c.conclusion === 'SUCCESS') ? '✓' :
        checks.some(c => c.conclusion === 'FAILURE') ? '✗' : '…'
      status = `#${pr.number} ${checkStatus}`
    }

    console.log(`  ${wt.branch.padEnd(40)} ${status.padEnd(15)} ${wt.path}`)
  }
  console.log('')
}
