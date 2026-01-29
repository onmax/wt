import { execSync, spawnSync } from 'node:child_process'
import { existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { consola } from 'consola'
import * as p from '@clack/prompts'
import { globSync } from 'tinyglobby'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function execSafe(cmd: string, opts: { cwd?: string } = {}): string | null {
  try { return exec(cmd, opts) } catch { return null }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/g, '')
}

function flattenBranch(branch: string): string {
  return branch.replace(/\//g, '-')
}

function copyIgnoredFiles(patterns: string[], srcDir: string, destDir: string): void {
  for (const pattern of patterns) {
    const files = globSync(pattern, { cwd: srcDir, dot: true })
    for (const file of files) {
      const src = join(srcDir, file)
      const dest = join(destDir, file)
      if (existsSync(src)) {
        copyFileSync(src, dest)
        consola.success(`Copied ${file}`)
      }
    }
  }
}

function getGitUser(): string | null {
  return execSafe('gh api user --jq .login')
}

function ensureFork(owner: string, name: string, cwd: string): string {
  const user = getGitUser()
  if (!user) throw new Error('Not logged in to gh')

  const forkExists = execSafe(`gh repo view ${user}/${name} --json name`) !== null
  if (!forkExists) {
    consola.start('Creating fork...')
    exec(`gh repo fork ${owner}/${name} --clone=false`)
  }

  const remotes = exec('git remote -v', { cwd })
  if (!remotes.includes('fork')) {
    exec(`git remote add fork https://github.com/${user}/${name}.git`, { cwd })
  }

  return user
}

interface Issue { number: number, title: string }
interface PR { number: number, title: string, headRefName: string }

function fetchIssues(ctx: Context): Issue[] {
  const json = exec(`gh issue list --repo ${ctx.owner}/${ctx.name} --state open --limit 100 --json number,title`)
  return JSON.parse(json)
}

function fetchPRs(ctx: Context): PR[] {
  const json = exec(`gh pr list --repo ${ctx.owner}/${ctx.name} --state open --limit 100 --json number,title,headRefName`)
  return JSON.parse(json)
}

// Detect if #123 is an issue or PR
function detectRefType(ctx: Context, num: number): { type: 'issue' | 'pr', data: Issue | PR } | null {
  // Try PR first
  const prJson = execSafe(`gh pr view ${num} --repo ${ctx.owner}/${ctx.name} --json number,title,headRefName`)
  if (prJson) {
    return { type: 'pr', data: JSON.parse(prJson) }
  }
  // Try issue
  const issueJson = execSafe(`gh issue view ${num} --repo ${ctx.owner}/${ctx.name} --json number,title`)
  if (issueJson) {
    return { type: 'issue', data: JSON.parse(issueJson) }
  }
  return null
}

async function createWorktree(ctx: Context, branch: string, opts: { baseBranch?: string, trackRemote?: boolean, createPr?: boolean, issueUrl?: string } = {}): Promise<void> {
  const { mainRepoPath, worktreesPath, owner, name, defaultBranch } = ctx
  const { baseBranch = defaultBranch, trackRemote = false, createPr = false } = opts
  const user = getGitUser()

  const worktreePath = join(worktreesPath, flattenBranch(branch))

  if (existsSync(worktreePath)) {
    consola.warn(`Already exists: ${worktreePath}`)
    spawnSync(process.env.SHELL || 'zsh', [], { cwd: worktreePath, stdio: 'inherit' })
    return
  }

  if (trackRemote) {
    // Clone existing remote branch
    consola.start(`Fetching: ${branch}`)
    exec(`git fetch origin ${branch}`, { cwd: mainRepoPath })

    const flatBranch = flattenBranch(branch)
    const branchExists = execSafe(`git rev-parse --verify ${branch}`, { cwd: mainRepoPath }) !== null
    if (branchExists) {
      exec(`git worktree add ../${flatBranch} ${branch}`, { cwd: mainRepoPath })
    } else {
      exec(`git worktree add --track -b ${branch} ../${flatBranch} origin/${branch}`, { cwd: mainRepoPath })
    }
  } else {
    // Create new branch from base
    consola.start(`Fetching ${baseBranch}...`)
    exec(`git fetch origin ${baseBranch}`, { cwd: mainRepoPath })

    const flatBranch = flattenBranch(branch)
    consola.start(`Creating: ${branch}`)
    exec(`git worktree add -b ${branch} ../${flatBranch} origin/${baseBranch}`, { cwd: mainRepoPath })

    let useFork = false
    consola.start('Pushing branch...')
    const pushResult = execSafe(`git push -u origin ${branch}`, { cwd: worktreePath })
    if (pushResult === null) {
      consola.warn('No push access, using fork...')
      ensureFork(owner, name, worktreePath)
      exec(`git push -u fork ${branch}`, { cwd: worktreePath })
      useFork = true
    }

    if (createPr) {
      consola.start('Creating draft PR...')
      try {
        const head = useFork ? `${user}:${branch}` : branch
        const prUrl = exec(`gh pr create --draft --title "${branch}" --body "" --head ${head} --repo ${owner}/${name}`, { cwd: worktreePath })
        consola.success(`Draft PR: ${prUrl}`)
      } catch {
        consola.warn('Failed to create PR')
      }
    }
  }

  if (ctx.propagatePatterns.length) {
    copyIgnoredFiles(ctx.propagatePatterns, ctx.worktreesPath, worktreePath)
  }

  // Install dependencies if package.json exists
  if (existsSync(join(worktreePath, 'package.json'))) {
    consola.start('Installing dependencies...')
    spawnSync('ni', [], { cwd: worktreePath, stdio: 'inherit' })
  }

  consola.success(`Ready: ${worktreePath}`)
  spawnSync(process.env.SHELL || 'zsh', [], { cwd: worktreePath, stdio: 'inherit' })
}

export async function add(ref: string | undefined, ctx: Context, flags: { pr?: boolean } = {}): Promise<void> {
  // No ref = interactive mode
  if (!ref) {
    const spinner = p.spinner()
    spinner.start('Fetching issues and PRs...')

    let issues: Issue[] = []
    let prs: PR[] = []
    try { issues = fetchIssues(ctx) } catch {}
    try { prs = fetchPRs(ctx) } catch {}

    spinner.stop()

    type Item = { type: 'custom' } | { type: 'issue', data: Issue } | { type: 'pr', data: PR }

    // Cache fetched data
    const cachedIssues = issues
    const cachedPRs = prs

    const selected = await p.autocomplete({
      message: 'Select issue, PR, or create custom:',
      maxItems: 15,
      placeholder: 'Type # or title to search...',
      options() {
        const search = this.userInput.trim()

        // Base options
        const baseOptions: { value: Item, label: string, hint?: string }[] = [
          { value: { type: 'custom' }, label: '+ Custom branch', hint: 'create new' },
        ]

        // Check if searching for specific number
        const numMatch = search.match(/^#?(\d+)$/)
        if (numMatch) {
          const num = Number(numMatch[1])

          // Check if already in cache
          const inCache = cachedIssues.some(i => i.number === num) ||
                          cachedPRs.some(p => p.number === num)

          if (!inCache) {
            // Live search using detectRefType
            const found = detectRefType(ctx, num)
            if (found) {
              if (found.type === 'pr') {
                const pr = found.data as PR
                return [
                  baseOptions[0],
                  { value: { type: 'pr', data: pr }, label: `[PR] #${pr.number} ${pr.title}`, hint: pr.headRefName }
                ]
              } else {
                const issue = found.data as Issue
                return [
                  baseOptions[0],
                  { value: { type: 'issue', data: issue }, label: `[Issue] #${issue.number} ${issue.title}` }
                ]
              }
            }
          }
        }

        // Return cached results
        return [
          ...baseOptions,
          ...cachedIssues.map(i => ({ value: { type: 'issue' as const, data: i }, label: `[Issue] #${i.number} ${i.title}` })),
          ...cachedPRs.map(pr => ({ value: { type: 'pr' as const, data: pr }, label: `[PR] #${pr.number} ${pr.title}`, hint: pr.headRefName })),
        ]
      }
    })
    if (p.isCancel(selected)) return process.exit(0)

    if (selected.type === 'custom') {
      const branch = await p.text({ message: 'Branch name:', placeholder: 'fix-something' })
      if (p.isCancel(branch)) return process.exit(0)
      const createPr = await p.confirm({ message: 'Create draft PR?', initialValue: false })
      if (p.isCancel(createPr)) return process.exit(0)
      await createWorktree(ctx, branch, { createPr })
      return
    }

    if (selected.type === 'issue') {
      const issue = selected.data
      const branch = `${issue.number}-${slugify(issue.title)}`
      const issueUrl = `https://github.com/${ctx.owner}/${ctx.name}/issues/${issue.number}`
      await createWorktree(ctx, branch, { createPr: flags.pr, issueUrl })
      return
    }

    if (selected.type === 'pr') {
      const pr = selected.data
      await createWorktree(ctx, pr.headRefName, { trackRemote: true })
      return
    }
  }

  // #123 = auto-detect issue or PR
  if (ref.startsWith('#')) {
    const num = Number.parseInt(ref.slice(1), 10)
    if (Number.isNaN(num)) { consola.error('Invalid number'); process.exit(1) }

    consola.start(`Looking up #${num}...`)
    const detected = detectRefType(ctx, num)
    if (!detected) { consola.error(`#${num} not found`); process.exit(1) }

    if (detected.type === 'pr') {
      const pr = detected.data as PR
      consola.info(`Found PR: ${pr.title}`)
      await createWorktree(ctx, pr.headRefName, { trackRemote: true })
    } else {
      const issue = detected.data as Issue
      consola.info(`Found issue: ${issue.title}`)
      const branch = `${issue.number}-${slugify(issue.title)}`
      const issueUrl = `https://github.com/${ctx.owner}/${ctx.name}/issues/${issue.number}`
      await createWorktree(ctx, branch, { createPr: flags.pr, issueUrl })
    }
    return
  }

  // @branch = clone remote branch
  if (ref.startsWith('@')) {
    const branch = ref.slice(1)
    await createWorktree(ctx, branch, { trackRemote: true })
    return
  }

  // Plain branch name = create new branch
  await createWorktree(ctx, ref, { createPr: flags.pr })
}
