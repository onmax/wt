import { execSync, spawn } from 'node:child_process'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function clean(prArg: string | undefined, ctx: Context): Promise<void> {
  const { cwd } = ctx

  let prNumber = prArg

  if (!prNumber) {
    try {
      const prJson = exec('gh pr view --json number', { cwd })
      prNumber = JSON.parse(prJson).number
    } catch {
      consola.error('No PR found for current branch. Usage: wt clean [pr-number]')
      process.exit(1)
    }
  }

  consola.info(`Spawning Claude to clean PR #${prNumber}...`)

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
