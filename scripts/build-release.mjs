import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  RELEASE_BUILD_FILE,
  RELEASE_METADATA_FILE,
  assertSafeDistRoot,
  assertSafeOutputFile,
  createReleaseManifest,
} from './release-manifest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const git = (...args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
}).trim()

const assertFrozenHead = () => {
  const commit = git('rev-parse', 'HEAD').toLowerCase()
  if (git('status', '--porcelain') !== '') {
    throw new Error('Release builds require a clean, frozen Git commit.')
  }
  return commit
}

const commitBeforeBuild = assertFrozenHead()
assertSafeDistRoot(root)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
execFileSync(npmCommand, ['run', 'build'], { cwd: root, stdio: 'inherit' })
const commitAfterBuild = assertFrozenHead()
if (commitBeforeBuild !== commitAfterBuild) {
  throw new Error('Git HEAD changed while building the release output.')
}

const safety = assertSafeDistRoot(root)
if (safety.distRealpath === null) throw new Error('Vite build did not create dist.')
const appBundle = createReleaseManifest(root, new Set([
  RELEASE_BUILD_FILE,
  RELEASE_METADATA_FILE,
]))
const provenancePath = assertSafeOutputFile(safety.distPath, RELEASE_BUILD_FILE)
writeFileSync(provenancePath, `${JSON.stringify({
  schemaVersion: 2,
  commit: commitAfterBuild,
  dirty: false,
  builtAt: new Date().toISOString(),
  appBundle,
}, null, 2)}\n`, 'utf8')
console.log(`[release:build] ${commitAfterBuild} dirty=false app=${appBundle.manifestSha256}`)
