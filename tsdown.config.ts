import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  exports: true,
  attw: { profile: 'esm-only' },
})
