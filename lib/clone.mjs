import { execSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { consola } from 'consola'

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

export async function clone(ctx) {
  const { mainRepoPath, worktreesPath, owner, name, defaultBranch, envPath } = ctx

  // Get open PRs
  consola.start('Fetching open PRs...')
  const prsJson = exec(`gh pr list --json number,title,headRefName --limit 50`, { cwd: mainRepoPath })
  const prs = JSON.parse(prsJson)

  if (prs.length === 0) {
    consola.info('No open PRs found')
    return
  }

  // Format for fzf
  const choices = prs.map(pr => `#${pr.number}\t${pr.headRefName}\t${pr.title}`)
  const fzfInput = choices.join('\n')

  // Run fzf
  const result = spawnSync('fzf', ['--header=Select PR to clone', '--delimiter=\t', '--with-nth=1,3'], {
    input: fzfInput,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  if (result.status !== 0 || !result.stdout.trim()) {
    consola.info('Cancelled')
    return
  }

  const selected = result.stdout.trim()
  const [prNum, branch] = selected.split('\t')
  const prNumber = prNum.replace('#', '')

  // Ensure worktrees directory exists
  if (!existsSync(worktreesPath)) {
    mkdirSync(worktreesPath, { recursive: true })
  }

  const worktreePath = join(worktreesPath, branch)

  if (existsSync(worktreePath)) {
    consola.warn(`Worktree already exists: ${worktreePath}`)
    console.log(`\ncd ${worktreePath}`)
    return
  }

  // Fetch the branch
  consola.start(`Fetching branch: ${branch}`)
  exec(`git fetch origin ${branch}`, { cwd: mainRepoPath })

  // Create worktree tracking the remote branch
  consola.start(`Creating worktree: ${branch}`)
  exec(`git worktree add --track -b ${branch} "${worktreePath}" origin/${branch}`, { cwd: mainRepoPath })

  // Copy .env if exists
  if (envPath) {
    const destEnv = join(worktreePath, '.env')
    copyFileSync(envPath, destEnv)
    consola.success('Copied .env')
  }

  consola.success(`Worktree ready: ${worktreePath}`)
  console.log(`\ncd ${worktreePath}`)
}
