import type { Context } from './context.js'
import { execSync, spawnSync } from 'node:child_process'
import * as p from '@clack/prompts'
import { consola } from 'consola'
import { getWorktrees } from './list.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function rm(name: string | undefined, ctx: Context): Promise<void> {
  const { mainRepoPath } = ctx

  let wtPath: string | undefined
  let branch: string | undefined

  if (!name) {
    const wts = getWorktrees(ctx)
    if (wts.length === 0) {
      consola.info('No worktrees')
      return
    }

    const selected = await p.select({
      message: 'Remove worktree:',
      options: wts.map(w => ({ value: w, label: w.branch, hint: w.path })),
    })
    if (p.isCancel(selected))
      return process.exit(0)

    branch = selected.branch
    wtPath = selected.path
  }
  else {
    const wts = getWorktrees(ctx)
    const found = wts.find(w => w.branch === name || w.path.endsWith(`/${name}`))
    if (!found) {
      consola.error(`Worktree not found: ${name}`)
      process.exit(1)
    }
    branch = found.branch
    wtPath = found.path
  }

  const confirmed = await p.confirm({ message: `Remove ${branch}?` })
  if (!confirmed || p.isCancel(confirmed))
    return process.exit(0)

  consola.start(`Removing: ${branch}`)
  exec(`git worktree remove "${wtPath}" --force`, { cwd: mainRepoPath })
  consola.success(`Removed: ${branch}`)

  spawnSync(process.env.SHELL || 'zsh', [], { cwd: ctx.worktreesPath, stdio: 'inherit' })
}
