import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  RELEASE_BUILD_FILE,
  RELEASE_METADATA_FILE,
  assertSafeDistRoot,
  assertSafeOutputFile,
  createReleaseManifest,
  equalManifest,
  readSafeReleaseFile,
} from './release-manifest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const git = (...args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
}).trim()

const headCommit = git('rev-parse', 'HEAD').toLowerCase()
const environmentCommit = process.env.GITHUB_SHA || process.env.COMMIT_REF || ''
if (environmentCommit !== '' && !/^[0-9a-f]{40}$/i.test(environmentCommit)) {
  throw new Error('Deployment environment SHA must be a full 40-character Git commit.')
}
if (environmentCommit !== '' && environmentCommit.toLowerCase() !== headCommit) {
  throw new Error(`Deployment environment SHA ${environmentCommit} does not match HEAD ${headCommit}.`)
}
const dirty = git('status', '--porcelain') !== ''
if (dirty) throw new Error('Release metadata requires a clean, frozen Git commit.')

const safety = assertSafeDistRoot(root)
if (safety.distRealpath === null) throw new Error('dist is missing; run release:build first.')
const indexPath = resolve(safety.distPath, 'index.html')
if (statSync(indexPath).size < 1) {
  throw new Error('dist/index.html is empty; refusing to stamp an invalid release.')
}

const provenance = JSON.parse(readSafeReleaseFile(safety.distPath, RELEASE_BUILD_FILE))
const appBundle = createReleaseManifest(root, new Set([
  RELEASE_BUILD_FILE,
  RELEASE_METADATA_FILE,
]))
if (
  provenance?.schemaVersion !== 2 ||
  provenance?.commit !== headCommit ||
  provenance?.dirty !== false ||
  typeof provenance?.builtAt !== 'string' ||
  !equalManifest(provenance?.appBundle, appBundle)
) {
  throw new Error('release-build.json does not match the current clean app bundle bytes.')
}

const publicManifest = createReleaseManifest(root, new Set([RELEASE_METADATA_FILE]))
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const metadata = {
  schemaVersion: 2,
  app: packageJson.name,
  version: packageJson.version,
  commit: headCommit,
  dirty: false,
  builtAt: new Date().toISOString(),
  buildProvenance: RELEASE_BUILD_FILE,
  appBundle,
  publicManifest,
  provider: process.env.GITHUB_ACTIONS === 'true'
    ? 'github-pages'
    : process.env.NETLIFY === 'true'
      ? 'netlify'
      : 'local',
}

const outputPath = assertSafeOutputFile(safety.distPath, RELEASE_METADATA_FILE)
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
console.log(
  `[release:metadata] ${headCommit} dirty=false app=${appBundle.manifestSha256} public=${publicManifest.manifestSha256}`,
)
