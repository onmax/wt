#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { consola } from 'consola'
import * as p from '@clack/prompts'
import type { Context } from './context.js'
import { getContext } from './context.js'
import { create } from './create.js'
import { clone } from './clone.js'
import { list } from './list.js'
import { sync } from './sync.js'
import { clean } from './clean.js'

const [,, cmd, ...args] = process.argv
const flags = args.filter(a => a.startsWith('--'))
const positional = args.filter(a => !a.startsWith('--'))

function exec(command: string): string {
  return execSync(command, { encoding: 'utf8' }).trim()
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/g, '')
}

interface Issue { number: number, title: string, author?: { login: string }, comments?: unknown[] }
interface PR { number: number, title: string, headRefName: string }

function fetchIssues(ctx: Context): Issue[] {
  const json = exec(`gh issue list --repo ${ctx.owner}/${ctx.name} --state open --limit 20 --json number,title,author,comments`)
  return JSON.parse(json)
}

function fetchPRs(ctx: Context): PR[] {
  const json = exec(`gh pr list --repo ${ctx.owner}/${ctx.name} --state open --limit 20 --json number,title,headRefName`)
  return JSON.parse(json)
}

async function interactive(ctx: Context): Promise<void> {
  p.intro('wt - worktrees CLI')

  const command = await p.select({
    message: 'What do you want to do?',
    options: [
      { value: 'create', label: 'Create', hint: 'new worktree + branch' },
      { value: 'clone', label: 'Clone', hint: 'existing PR as worktree' },
      { value: 'list', label: 'List', hint: 'all worktrees with PR status' },
      { value: 'sync', label: 'Sync', hint: 'pull latest from base branch' },
      { value: 'clean', label: 'Clean', hint: 'verify CI + squash merge' },
    ],
  })
  if (p.isCancel(command)) return process.exit(0)

  if (command === 'create') {
    const source = await p.select({
      message: 'Create from:',
      options: [
        { value: 'issue', label: 'Issue', hint: 'select open issue' },
        { value: 'pr', label: 'PR', hint: 'select open PR' },
        { value: 'custom', label: 'Custom', hint: 'enter branch name' },
      ],
    })
    if (p.isCancel(source)) return process.exit(0)

    let branch, issueUrl
    if (source === 'issue') {
      const spinner = p.spinner()
      spinner.start('Fetching issues...')
      const issues = await fetchIssues(ctx)
      spinner.stop()
      if (!issues.length) { consola.warn('No open issues'); return }
      const issue = await p.select({
        message: 'Select issue:',
        options: issues.map(i => {
          const author = i.author?.login || '?'
          const comments = i.comments?.length || 0
          const hint = `@${author} · ${comments}💬`
          return { value: i, label: `#${i.number} ${i.title}`, hint }
        }),
      })
      if (p.isCancel(issue)) return process.exit(0)
      branch = `${issue.number}-${slugify(issue.title)}`
      issueUrl = `https://github.com/${ctx.owner}/${ctx.name}/issues/${issue.number}`
    } else if (source === 'pr') {
      const spinner = p.spinner()
      spinner.start('Fetching PRs...')
      const prs = await fetchPRs(ctx)
      spinner.stop()
      if (!prs.length) { consola.warn('No open PRs'); return }
      const pr = await p.select({
        message: 'Select PR:',
        options: prs.map(pr => ({ value: pr, label: `#${pr.number} ${pr.title}` })),
      })
      if (p.isCancel(pr)) return process.exit(0)
      branch = pr.headRefName
    } else {
      branch = await p.text({ message: 'Branch name:', placeholder: 'fix-something' })
      if (p.isCancel(branch)) return process.exit(0)
    }

    const createPr = await p.confirm({ message: 'Create draft PR?', initialValue: false })
    if (p.isCancel(createPr)) return process.exit(0)

    await create(branch, { ...ctx, createPr, issueUrl })
  } else if (command === 'clone') {
    await clone(ctx)
    p.outro('Done!')
  } else if (command === 'list') {
    await list(ctx)
    p.outro('Done!')
  } else if (command === 'sync') {
    await sync(ctx)
    p.outro('Done!')
  } else if (command === 'clean') {
    const pr = await p.text({ message: 'PR number (optional):', placeholder: 'leave empty for current' })
    if (p.isCancel(pr)) return process.exit(0)
    await clean(pr || undefined, ctx)
    p.outro('Done!')
  }
}

async function main() {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`
wt - worktrees CLI

Commands:
  wt                           Interactive mode
  wt create <branch> [--pr]    Create worktree + branch (--pr: also create draft PR)
  wt clone                     Pick open PR with fzf, clone as worktree
  wt list                      Show all worktrees with PR status
  wt sync                      Pull latest from base branch
  wt clean [pr]                Spawn Claude to verify CI + squash
`)
    return
  }

  let ctx
  try {
    ctx = await getContext()
  } catch (err) {
    consola.error('Run this from inside a git repository')
    process.exit(1)
  }

  try {
    // Interactive mode when no command
    if (!cmd) {
      await interactive(ctx)
      return
    }

    const commands = {
      create: () => create(positional[0], { ...ctx, createPr: flags.includes('--pr') }),
      clone: () => clone(ctx),
      list: () => list(ctx),
      sync: () => sync(ctx),
      clean: () => clean(positional[0], ctx),
    }

    if (!commands[cmd]) {
      consola.error(`Unknown command: ${cmd}`)
      process.exit(1)
    }

    await commands[cmd]()
  } catch (err) {
    consola.error(err.message)
    process.exit(1)
  }
}

main()
