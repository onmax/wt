import { execSync, spawnSync } from 'node:child_process'
import { consola } from 'consola'
import type { Context } from './context.js'
import { getWorktrees } from './list.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function rm(name: string | undefined, ctx: Context): Promise<void> {
  const { mainRepoPath } = ctx

  let wtPath: string | undefined
  let branch: string | undefined

  if (!name) {
    // Interactive: fzf picker
    const wts = getWorktrees(ctx)
    if (wts.length === 0) {
      consola.info('No worktrees')
      return
    }

    const choices = wts.map(w => `${w.branch}\t${w.path}`)
    const result = spawnSync('fzf', ['--header=Select worktree to remove', '--delimiter=\t', '--with-nth=1'], {
      input: choices.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'],
    })

    if (result.status !== 0 || !result.stdout?.trim()) {
      consola.info('Cancelled')
      return
    }

    const [selectedBranch, selectedPath] = result.stdout.trim().split('\t')
    branch = selectedBranch
    wtPath = selectedPath
  } else {
    // Find by name
    const wts = getWorktrees(ctx)
    const found = wts.find(w => w.branch === name || w.path.endsWith(`/${name}`))
    if (!found) {
      consola.error(`Worktree not found: ${name}`)
      process.exit(1)
    }
    branch = found.branch
    wtPath = found.path
  }

  consola.start(`Removing: ${branch}`)
  exec(`git worktree remove "${wtPath}" --force`, { cwd: mainRepoPath })
  consola.success(`Removed: ${branch}`)
}
