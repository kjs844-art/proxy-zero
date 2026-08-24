import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'

const git = (...args: string[]): string => execFileSync('git', args, {
  encoding: 'utf8',
}).trim()

const buildCommit = git('rev-parse', 'HEAD').toLowerCase()
const buildDirty = git('status', '--porcelain') !== ''

export default defineConfig({
  base: './',
  define: {
    __PZ_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __PZ_BUILD_DIRTY__: JSON.stringify(buildDirty),
  },
})
