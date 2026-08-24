import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const RELEASE_BUILD_FILE = 'release-build.json'
export const RELEASE_METADATA_FILE = 'release.json'

const toPosixPath = (value) => value.split(sep).join('/')

const isContainedBy = (parent, candidate) => {
  const path = relative(parent, candidate)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

const requireContainedPath = (parent, candidate, label) => {
  if (!isContainedBy(parent, candidate)) {
    throw new Error(`${label} escapes the repository root: ${candidate}`)
  }
}

const lstatIfPresent = (path) => lstatSync(path, { throwIfNoEntry: false })

/** Refuse links/reparse points before Vite can clear its output directory. */
export const assertSafeDistRoot = (root) => {
  const rootRealpath = realpathSync(root)
  const distPath = resolve(root, 'dist')
  requireContainedPath(rootRealpath, resolve(rootRealpath, 'dist'), 'Configured dist path')

  const distStat = lstatIfPresent(distPath)
  if (!distStat) return { distPath, distRealpath: null, rootRealpath }
  if (distStat.isSymbolicLink()) {
    throw new Error(`Refusing linked or reparse-point dist directory: ${distPath}`)
  }
  if (!distStat.isDirectory()) throw new Error(`dist must be a directory when present: ${distPath}`)

  const distRealpath = realpathSync(distPath)
  requireContainedPath(rootRealpath, distRealpath, 'dist directory')
  return { distPath, distRealpath, rootRealpath }
}

const assertSafeRegularFile = (path) => {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) throw new Error(`Release output must not contain symbolic links: ${path}`)
  if (!stat.isFile()) throw new Error(`Release output must contain regular files only: ${path}`)
  return stat
}

export const assertSafeOutputFile = (distPath, filename) => {
  const path = resolve(distPath, filename)
  const stat = lstatIfPresent(path)
  if (!stat) return path
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Refusing to overwrite linked or non-file release output: ${path}`)
  }
  return path
}

export const readSafeReleaseFile = (distPath, filename) => {
  const path = assertSafeOutputFile(distPath, filename)
  if (!lstatIfPresent(path)) throw new Error(`Required release file is missing: ${path}`)
  return readFileSync(path, 'utf8')
}

const listRegularFiles = (distPath, distRealpath, excluded) => {
  const files = []
  const visit = (directory) => {
    const directoryStat = lstatSync(directory)
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error(`Release output directory is linked or invalid: ${directory}`)
    }
    const directoryRealpath = realpathSync(directory)
    if (!isContainedBy(distRealpath, directoryRealpath)) {
      throw new Error(`Release output directory escapes dist: ${directory}`)
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Release output must not contain symbolic links: ${path}`)
      }
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!entry.isFile()) throw new Error(`Release output contains a non-file entry: ${path}`)

      const relativePath = toPosixPath(relative(distPath, path))
      if (relativePath.startsWith('../') || isAbsolute(relativePath)) {
        throw new Error(`Release output file escaped dist: ${path}`)
      }
      const stat = assertSafeRegularFile(path)
      if (excluded.has(relativePath)) continue
      files.push({
        path: relativePath,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
        size: stat.size,
      })
    }
  }
  visit(distPath)
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'))
}

export const createReleaseManifest = (root, excluded) => {
  const safety = assertSafeDistRoot(root)
  if (safety.distRealpath === null) throw new Error('dist is missing; run the release build first.')
  const files = listRegularFiles(safety.distPath, safety.distRealpath, excluded)
  if (files.length === 0) throw new Error('dist contains no release files.')
  return {
    files,
    manifestSha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
  }
}

export const equalManifest = (left, right) => JSON.stringify(left) === JSON.stringify(right)
