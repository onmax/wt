#!/usr/bin/env node
import type { Context } from './context.js'
import { spawnSync } from 'node:child_process'
import { consola } from 'consola'
import { add } from './add.js'
import { ci } from './ci.js'
import { getContext } from './context.js'
import { init } from './init.js'
import { list, pickWorktree } from './list.js'
import { rm } from './rm.js'
import { sync } from './sync.js'

const [,, cmd, ...args] = process.argv
const flags = args.filter(a => a.startsWith('--'))
const positional = args.filter(a => !a.startsWith('--'))

async function main() {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`
wt - git worktrees CLI

Commands:
  wt init <url> [name]   clone repo with bare pattern
  wt                     picker → cd into worktree
  wt add [ref] [--pr]    smart add (see below)
  wt ls                  list worktrees with PR/CI status
  wt rm [name]           remove worktree
  wt sync                rebase on base branch
  wt ci                  show CI status for current PR

wt add examples:
  wt add                 interactive: pick issue/PR/custom
  wt add fix-bug         new branch from default
  wt add #123            auto-detect: issue or PR
  wt add @branch         clone existing remote branch
  wt add fix-bug --pr    create draft PR
`)
    return
  }

  // Early exit for init (runs outside repo)
  if (cmd === 'init') {
    if (!positional[0]) {
      consola.error('Usage: wt init <url> [name]')
      process.exit(1)
    }
    await init(positional[0], positional[1])
    return
  }

  let ctx: Context
  try {
    ctx = await getContext()
  }
  catch (err) {
    consola.error((err as Error).message)
    process.exit(1)
  }

  try {
    // No command = picker
    if (!cmd) {
      const wtPath = await pickWorktree(ctx)
      if (wtPath === undefined)
        return // cancelled
      if (wtPath === null) { // create new
        await add(undefined, ctx, {})
        return
      }
      spawnSync(process.env.SHELL || 'zsh', [], { cwd: wtPath, stdio: 'inherit' })
      return
    }

    const commands: Record<string, () => Promise<void>> = {
      add: () => add(positional[0], ctx, { pr: flags.includes('--pr') }),
      ls: () => list(ctx),
      list: () => list(ctx),
      rm: () => rm(positional[0], ctx),
      remove: () => rm(positional[0], ctx),
      sync: () => sync(ctx),
      ci: () => ci(ctx),
    }

    if (!commands[cmd]) {
      consola.error(`Unknown command: ${cmd}`)
      process.exit(1)
    }

    await commands[cmd]()
  }
  catch (err) {
    consola.error((err as Error).message)
    process.exit(1)
  }
}

main()
