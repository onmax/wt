import { execSync } from 'node:child_process'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): void {
  execSync(cmd, { encoding: 'utf8', stdio: 'inherit', ...opts })
}

export async function sync(ctx: Context): Promise<void> {
  const { cwd, defaultBranch } = ctx

  consola.start(`Syncing with ${defaultBranch}...`)
  exec(`git fetch origin ${defaultBranch}`, { cwd })
  exec(`git rebase origin/${defaultBranch}`, { cwd })
  consola.success('Synced!')
}
