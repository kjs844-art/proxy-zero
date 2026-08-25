import { constants as fsConstants } from 'node:fs'
import { access, lstat, readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { isAbsolute, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const INITIAL_GZIP_LIMIT_BYTES = 15_000_000
export const DIST_RAW_LIMIT_BYTES = 40_000_000

const BOOT_ATLAS_PATH = 'assets/sprites/actors.multiatlas.json'
const BOOT_AUDIO_DIRECTORY = 'assets/audio/'
const BOOT_ENVIRONMENT_PATHS = Object.freeze([
  'assets/environment/n9-depot-v2.png',
  'assets/environment/service-train-v2.png',
  'assets/environment/flooded-tunnel-v2.png',
])

const toPosixPath = (value) => value.split(sep).join('/')

const assertByteCount = (label, value) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`)
  }
}

export const evaluateBudgets = (
  { initialGzipBytes, distRawBytes },
  {
    initialGzipLimitBytes = INITIAL_GZIP_LIMIT_BYTES,
    distRawLimitBytes = DIST_RAW_LIMIT_BYTES,
  } = {},
) => {
  assertByteCount('initialGzipBytes', initialGzipBytes)
  assertByteCount('distRawBytes', distRawBytes)
  assertByteCount('initialGzipLimitBytes', initialGzipLimitBytes)
  assertByteCount('distRawLimitBytes', distRawLimitBytes)

  const initialGzipOverageBytes = Math.max(0, initialGzipBytes - initialGzipLimitBytes)
  const distRawOverageBytes = Math.max(0, distRawBytes - distRawLimitBytes)

  return Object.freeze({
    passed: initialGzipOverageBytes === 0 && distRawOverageBytes === 0,
    initialGzipLimitBytes,
    distRawLimitBytes,
    initialGzipOverageBytes,
    distRawOverageBytes,
  })
}

const listRegularFiles = async (rootDirectory) => {
  const files = []

  const visit = async (directory) => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      throw new Error(`Cannot read deployment directory ${directory}: ${error.message}`, {
        cause: error,
      })
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Deployment output must not contain symbolic links: ${absolutePath}`)
      }
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (entry.isFile()) {
        const relativePath = toPosixPath(relative(rootDirectory, absolutePath))
        if (relativePath.startsWith('../') || isAbsolute(relativePath)) {
          throw new Error(`Deployment file escaped dist: ${absolutePath}`)
        }
        files.push({ absolutePath, relativePath })
      }
    }
  }

  await visit(rootDirectory)
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'))
}

const readRequiredFile = async (file) => {
  try {
    await access(file.absolutePath, fsConstants.R_OK)
    return await readFile(file.absolutePath)
  } catch (error) {
    throw new Error(`Cannot read deployment file ${file.relativePath}: ${error.message}`, {
      cause: error,
    })
  }
}

const collectBootPreloadPaths = async (fileByRelativePath) => {
  const atlasFile = fileByRelativePath.get(BOOT_ATLAS_PATH)
  if (!atlasFile) {
    throw new Error(`Boot-preloaded atlas is missing: ${BOOT_ATLAS_PATH}`)
  }

  let atlas
  try {
    atlas = JSON.parse((await readRequiredFile(atlasFile)).toString('utf8'))
  } catch (error) {
    throw new Error(`Boot-preloaded atlas is unreadable or invalid: ${BOOT_ATLAS_PATH}`, {
      cause: error,
    })
  }

  if (!Array.isArray(atlas.textures) || atlas.textures.length === 0) {
    throw new Error(`Boot-preloaded atlas has no texture pages: ${BOOT_ATLAS_PATH}`)
  }

  const bootPaths = new Set([BOOT_ATLAS_PATH])
  const atlasDirectory = posix.dirname(BOOT_ATLAS_PATH)
  for (const texture of atlas.textures) {
    if (typeof texture?.image !== 'string' || texture.image.length === 0) {
      throw new Error(`Boot-preloaded atlas contains an invalid texture image path.`)
    }

    if (texture.image.includes('\\') || posix.isAbsolute(texture.image)) {
      throw new Error(`Boot-preloaded atlas texture path must stay relative: ${texture.image}`)
    }
    const imagePath = posix.normalize(posix.join(atlasDirectory, texture.image))
    if (imagePath.startsWith('../')) {
      throw new Error(`Boot-preloaded atlas texture escaped dist: ${texture.image}`)
    }
    if (!fileByRelativePath.has(imagePath)) {
      throw new Error(`Boot-preloaded atlas texture is missing: ${imagePath}`)
    }
    bootPaths.add(imagePath)
  }

  const audioPaths = [...fileByRelativePath.keys()].filter(
    (relativePath) => relativePath.startsWith(BOOT_AUDIO_DIRECTORY)
      && relativePath.toLowerCase().endsWith('.wav'),
  )
  if (audioPaths.length === 0) {
    throw new Error(`Boot-preloaded audio is missing from ${BOOT_AUDIO_DIRECTORY}`)
  }
  for (const audioPath of audioPaths) bootPaths.add(audioPath)

  for (const environmentPath of BOOT_ENVIRONMENT_PATHS) {
    if (!fileByRelativePath.has(environmentPath)) {
      throw new Error(`Boot-preloaded environment asset is missing: ${environmentPath}`)
    }
    bootPaths.add(environmentPath)
  }

  return bootPaths
}

const isInitialCodeFile = (relativePath) => /\.(?:html|js|css)$/i.test(relativePath)

export const analyzeDist = async (
  distDirectory,
  limits = {},
) => {
  const distRoot = resolve(distDirectory)
  let rootStat
  try {
    rootStat = await lstat(distRoot)
    await access(distRoot, fsConstants.R_OK)
  } catch (error) {
    throw new Error(`Missing or unreadable dist directory: ${distRoot}`, { cause: error })
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Dist path is not a directory: ${distRoot}`)
  }

  const files = await listRegularFiles(distRoot)
  if (files.length === 0) {
    throw new Error(`Dist directory is empty: ${distRoot}`)
  }

  const fileByRelativePath = new Map(files.map((file) => [file.relativePath, file]))
  const bootPreloadPaths = await collectBootPreloadPaths(fileByRelativePath)
  const measurements = []
  let distRawBytes = 0
  let initialGzipBytes = 0

  for (const file of files) {
    const contents = await readRequiredFile(file)
    const rawBytes = contents.byteLength
    const gzipBytes = gzipSync(contents, { level: 9 }).byteLength
    const initial = isInitialCodeFile(file.relativePath) || bootPreloadPaths.has(file.relativePath)

    distRawBytes += rawBytes
    if (initial) initialGzipBytes += gzipBytes
    measurements.push(Object.freeze({
      path: file.relativePath,
      rawBytes,
      gzipBytes,
      initial,
    }))
  }

  if (distRawBytes === 0) {
    throw new Error(`Dist directory contains no data: ${distRoot}`)
  }

  const budget = evaluateBudgets({ initialGzipBytes, distRawBytes }, limits)
  return Object.freeze({
    distRoot,
    files: Object.freeze(measurements),
    initialGzipBytes,
    distRawBytes,
    ...budget,
  })
}

export const formatReport = (result) => {
  const lines = ['[qa:size] per-file sizes (gzip level 9)']
  for (const file of result.files) {
    lines.push(
      `[qa:size] ${file.initial ? 'initial' : 'dist-only'} ${file.path} raw=${file.rawBytes} gzip9=${file.gzipBytes}`,
    )
  }

  lines.push(
    `[qa:size] initial-gzip9 total=${result.initialGzipBytes} limit=${result.initialGzipLimitBytes} overage=${result.initialGzipOverageBytes}`,
    `[qa:size] dist-raw total=${result.distRawBytes} limit=${result.distRawLimitBytes} overage=${result.distRawOverageBytes}`,
    `[qa:size] ${result.passed ? 'PASS' : 'FAIL'}`,
  )
  return lines.join('\n')
}

const parseCli = (arguments_) => {
  if (arguments_.length === 0) return resolve(process.cwd(), 'dist')
  if (arguments_.length === 2 && arguments_[0] === '--dist') return resolve(arguments_[1])
  throw new Error('Usage: node scripts/check-asset-budget.mjs [--dist <directory>]')
}

const runCli = async () => {
  try {
    const result = await analyzeDist(parseCli(process.argv.slice(2)))
    console.log(formatReport(result))
    if (!result.passed) process.exitCode = 1
  } catch (error) {
    console.error(`[qa:size] FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

const modulePath = fileURLToPath(import.meta.url)
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (modulePath.toLowerCase() === invokedPath.toLowerCase()) {
  await runCli()
}
