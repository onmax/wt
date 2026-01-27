import { execSync } from 'node:child_process'
import { consola } from 'consola'
import type { Context } from './context.js'

function exec(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function execSafe(cmd: string, opts: { cwd?: string } = {}): string | null {
  try { return exec(cmd, opts) } catch { return null }
}

export async function ci(ctx: Context): Promise<void> {
  const { cwd } = ctx

  const prJson = execSafe('gh pr view --json number,title,url', { cwd })
  if (!prJson) {
    consola.error('No PR for current branch')
    process.exit(1)
  }

  const pr = JSON.parse(prJson) as { number: number, title: string, url: string }
  consola.info(`PR #${pr.number}: ${pr.title}`)
  console.log(pr.url)
  console.log('')

  execSync(`gh pr checks ${pr.number}`, { cwd, stdio: 'inherit' })
}
