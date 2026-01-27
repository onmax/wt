import { execSync, spawnSync } from 'node:child_process'
import * as p from '@clack/prompts'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

interface Worktree { path: string, branch: string }

export function getWorktrees(ctx: Context): Worktree[] {
  const output = exec('git worktree list --porcelain', { cwd: ctx.mainRepoPath })
  const lines = output.split('\n')
  const worktrees: Worktree[] = []
  let current: Partial<Worktree> = {}

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path && current.branch) worktrees.push(current as Worktree)
      current = { path: line.replace('worktree ', '') }
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch refs/heads/', '')
    } else if (line === 'bare') {
      current = {}
    }
  }
  if (current.path && current.branch) worktrees.push(current as Worktree)

  return worktrees.filter(w => w.path !== ctx.mainRepoPath)
}

export async function open(ctx: Context): Promise<void> {
  const wts = getWorktrees(ctx)

  if (wts.length === 0) {
    consola.info('No worktrees found')
    return
  }

  const selected = await p.select({
    message: 'Select worktree:',
    options: wts.map(w => ({ value: w.path, label: w.branch })),
  })
  if (p.isCancel(selected)) return process.exit(0)

  const prompt = await p.text({ message: 'Prompt (empty to skip):', placeholder: '', defaultValue: '' })
  if (p.isCancel(prompt)) return process.exit(0)

  launchInWorktree(selected, prompt || undefined)
}

export function launchInWorktree(wtPath: string, prompt?: string): void {
  consola.info('Launching Claude in plan mode...')
  const args = ['--permission-mode', 'plan', '--allow-dangerously-skip-permissions']
  if (prompt) args.push(prompt)
  spawnSync('claude', args, {
    cwd: wtPath,
    stdio: 'inherit',
  })

  spawnSync(process.env.SHELL || 'zsh', [], {
    cwd: wtPath,
    stdio: 'inherit',
  })
}
