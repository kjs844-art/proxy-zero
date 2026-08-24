import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// The release gate is deliberately a directly executable Node ESM script.
// @ts-expect-error TypeScript does not emit declarations for repository .mjs scripts.
import { analyzeDist, DIST_RAW_LIMIT_BYTES, evaluateBudgets, INITIAL_GZIP_LIMIT_BYTES } from '../../scripts/check-asset-budget.mjs'

const temporaryDirectories: string[] = []

const makeTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'proxy-zero-size-gate-'))
  temporaryDirectories.push(directory)
  return directory
}

const writeFixtureDist = async () => {
  const root = await makeTemporaryDirectory()
  await mkdir(join(root, 'assets', 'sprites'), { recursive: true })
  await mkdir(join(root, 'assets', 'audio'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<script src="./assets/app.js"></script>')
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("ready")')
  await writeFile(join(root, 'assets', 'app.css'), 'body{margin:0}')
  await writeFile(
    join(root, 'assets', 'sprites', 'actors.multiatlas.json'),
    JSON.stringify({ textures: [{ image: 'actors.png' }] }),
  )
  await writeFile(join(root, 'assets', 'sprites', 'actors.png'), Buffer.from([1, 2, 3]))
  await writeFile(join(root, 'assets', 'audio', 'hit.wav'), Buffer.from([4, 5, 6]))
  await writeFile(join(root, 'release-note.txt'), 'deployment-only')
  return root
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('asset budget release gate', () => {
  it('passes both exact byte boundaries and fails at one byte over', () => {
    expect(evaluateBudgets({
      initialGzipBytes: INITIAL_GZIP_LIMIT_BYTES,
      distRawBytes: DIST_RAW_LIMIT_BYTES,
    })).toMatchObject({
      passed: true,
      initialGzipOverageBytes: 0,
      distRawOverageBytes: 0,
    })

    expect(evaluateBudgets({
      initialGzipBytes: INITIAL_GZIP_LIMIT_BYTES + 1,
      distRawBytes: DIST_RAW_LIMIT_BYTES,
    })).toMatchObject({
      passed: false,
      initialGzipOverageBytes: 1,
      distRawOverageBytes: 0,
    })

    expect(evaluateBudgets({
      initialGzipBytes: INITIAL_GZIP_LIMIT_BYTES,
      distRawBytes: DIST_RAW_LIMIT_BYTES + 1,
    })).toMatchObject({
      passed: false,
      initialGzipOverageBytes: 0,
      distRawOverageBytes: 1,
    })
  })

  it('counts startup code and Boot runtime assets once while retaining every dist file raw', async () => {
    const root = await writeFixtureDist()
    const result = await analyzeDist(root)
    const initialPaths = result.files
      .filter((file: { initial: boolean }) => file.initial)
      .map((file: { path: string }) => file.path)

    expect(initialPaths).toEqual([
      'assets/app.css',
      'assets/app.js',
      'assets/audio/hit.wav',
      'assets/sprites/actors.multiatlas.json',
      'assets/sprites/actors.png',
      'index.html',
    ])
    expect(result.files).toHaveLength(7)
    expect(result.distRawBytes).toBe(
      result.files.reduce((total: number, file: { rawBytes: number }) => total + file.rawBytes, 0),
    )
  })

  it('fails missing and empty dist inputs', async () => {
    const root = await makeTemporaryDirectory()
    await expect(analyzeDist(join(root, 'missing'))).rejects.toThrow(/Missing or unreadable dist/)
    await expect(analyzeDist(root)).rejects.toThrow(/Dist directory is empty/)
  })
})
