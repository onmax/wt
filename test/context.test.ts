import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function exec(cmd: string, opts?: { cwd?: string }): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function execSafe(cmd: string, opts?: { cwd?: string }): string | null {
  try { return exec(cmd, opts) }
  catch { return null }
}

describe('context utils', () => {
  describe('exec', () => {
    it('executes command and returns output', () => {
      const result = exec('echo "test"')
      expect(result).toBe('test')
    })

    it('trims whitespace', () => {
      const result = exec('echo "  test  "')
      expect(result).toBe('test')
    })
  })

  describe('execSafe', () => {
    it('returns output on success', () => {
      const result = execSafe('echo "test"')
      expect(result).toBe('test')
    })

    it('returns null on error', () => {
      const result = execSafe('invalid-command-xyz')
      expect(result).toBeNull()
    })
  })
})
