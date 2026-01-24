import { execSync } from 'child_process'
import { consola } from 'consola'

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'inherit', ...opts })
}

export async function sync(ctx) {
  const { cwd, defaultBranch } = ctx

  consola.start(`Syncing with ${defaultBranch}...`)

  // Fetch latest
  exec(`git fetch origin ${defaultBranch}`, { cwd })

  // Rebase onto origin/defaultBranch
  exec(`git rebase origin/${defaultBranch}`, { cwd })

  consola.success('Synced!')
}
