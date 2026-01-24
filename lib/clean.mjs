import { execSync, spawn } from 'child_process'
import { consola } from 'consola'

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function clean(prArg, ctx) {
  const { cwd, mainRepoPath } = ctx

  // Determine PR number
  let prNumber = prArg

  if (!prNumber) {
    // Try to get PR for current branch
    try {
      const prJson = exec(`gh pr view --json number`, { cwd })
      prNumber = JSON.parse(prJson).number
    } catch {
      consola.error('No PR found for current branch. Usage: wt clean [pr-number]')
      process.exit(1)
    }
  }

  consola.info(`Spawning Claude to clean PR #${prNumber}...`)

  // Spawn Claude with the clean task
  const claude = spawn('claude', [
    '--print',
    `Check PR #${prNumber} status:
1. Run: gh pr view ${prNumber} --json statusCheckRollup,commits
2. If CI passing and >1 commit, squash commits interactively
3. If CI failing, report the failures
4. If already 1 commit, report "Already clean"`
  ], {
    cwd,
    stdio: 'inherit',
  })

  claude.on('close', (code) => {
    if (code !== 0) {
      consola.error('Claude exited with error')
      process.exit(1)
    }
  })
}
