import { describe, expect, it } from 'vitest'

// Utility function tests from add.ts
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/g, '')
}

function flattenBranch(branch: string): string {
  return branch.replace(/\//g, '-')
}

describe('add utils', () => {
  describe('slugify', () => {
    it('converts text to slug', () => {
      expect(slugify('Fix: Handle Edge Cases')).toBe('fix-handle-edge-cases')
    })

    it('removes special chars', () => {
      expect(slugify('feat/new-feature!')).toBe('feat-new-feature')
    })

    it('truncates to 40 chars', () => {
      expect(slugify('a'.repeat(50))).toBe('a'.repeat(40))
    })

    it('removes trailing dashes', () => {
      expect(slugify('test-')).toBe('test')
    })
  })

  describe('flattenBranch', () => {
    it('replaces slashes with dashes', () => {
      expect(flattenBranch('feat/new-feature')).toBe('feat-new-feature')
      expect(flattenBranch('fix/bug/nested')).toBe('fix-bug-nested')
    })
  })
})
