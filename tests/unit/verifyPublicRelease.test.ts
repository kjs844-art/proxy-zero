import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// The verifier is intentionally a Node 22 .mjs script; this test imports its
// exported pure helpers and injectable transport without using the network.
// @ts-ignore The fixture exercises a JavaScript-only release verifier.
import * as verifier from '../../scripts/verify-public-release.mjs'

const {
  MAX_DECLARED_FILE_BYTES,
  MAX_MANIFEST_FILES,
  MAX_MANIFEST_PATH_LENGTH,
  MAX_RELEASE_JSON_BYTES,
  classifyIpAddress,
  hashManifestFiles,
  validateManifest,
  verifyPublicRelease,
} = verifier

const commit = 'b'.repeat(40)
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const entry = (path: string, size = 1) => ({ path, size, sha256: 'a'.repeat(64) })
const expectRejected = async (operation: () => unknown) => {
  await expect(Promise.resolve().then(operation)).rejects.toThrow()
}

describe('public release verifier safety boundaries', () => {
  it('rejects encoded/long paths, extra keys, oversized files, and huge manifests', async () => {
    const encoded = entry('assets%2Fmain.js')
    await expectRejected(() => validateManifest({
      files: [encoded],
      manifestSha256: hashManifestFiles([encoded]),
    }))

    const longPath = entry('x'.repeat(MAX_MANIFEST_PATH_LENGTH + 1))
    await expectRejected(() => validateManifest({
      files: [longPath],
      manifestSha256: hashManifestFiles([longPath]),
    }))

    const extra = { ...entry('extra.js'), contentType: 'text/javascript' }
    await expectRejected(() => validateManifest({
      files: [extra],
      manifestSha256: hashManifestFiles([extra]),
    }))

    const unsorted = [entry('z.js'), entry('a.js')]
    await expectRejected(() => validateManifest({
      files: unsorted,
      manifestSha256: hashManifestFiles(unsorted),
    }))

    const oversized = entry('oversized.bin', MAX_DECLARED_FILE_BYTES + 1)
    await expectRejected(() => validateManifest({
      files: [oversized],
      manifestSha256: hashManifestFiles([oversized]),
    }))

    const overTotal = [entry('a.bin', 20_000_001), entry('b.bin', 20_000_000)]
    await expectRejected(() => validateManifest({
      files: overTotal,
      manifestSha256: hashManifestFiles(overTotal),
    }))

    const huge = Array.from({ length: MAX_MANIFEST_FILES + 1 }, (_, index) => (
      entry(`${String(index).padStart(5, '0')}.bin`)
    ))
    await expectRejected(() => validateManifest({
      files: huge,
      manifestSha256: hashManifestFiles(huge),
    }))
  })

  it('classifies only globally routable addresses as valid transport targets', () => {
    for (const address of [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.1.1',
      '192.168.1.1',
      '192.0.2.1',
      '::1',
      '::ffff:192.168.1.1',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '2001:1::4',
      '2001:5::1',
      '2001:db8::1',
    ]) {
      expect(classifyIpAddress(address).isGlobal).toBe(false)
    }
    for (const address of ['8.8.8.8', '2001:4860:4860::8888']) {
      expect(classifyIpAddress(address).isGlobal).toBe(true)
    }
  })

  it('uses the streaming injectable transport and enforces the JSON decoded cap', async () => {
    const appBytes = Buffer.from('<!doctype html>')
    const appEntry = { path: 'index.html', size: appBytes.length, sha256: sha256(appBytes) }
    const appBundle = {
      files: [appEntry],
      manifestSha256: hashManifestFiles([appEntry]),
    }
    const provenanceBytes = Buffer.from(JSON.stringify({
      schemaVersion: 2,
      commit,
      dirty: false,
      builtAt: '2026-01-01T00:00:00Z',
      appBundle,
    }))
    const provenanceEntry = {
      path: 'release-build.json',
      size: provenanceBytes.length,
      sha256: sha256(provenanceBytes),
    }
    const publicFiles = [appEntry, provenanceEntry]
    const release = {
      schemaVersion: 2,
      app: 'proxy-zero',
      version: '0.1.0',
      commit,
      dirty: false,
      builtAt: '2026-01-01T00:00:00Z',
      buildProvenance: 'release-build.json',
      appBundle,
      publicManifest: {
        files: publicFiles,
        manifestSha256: hashManifestFiles(publicFiles),
      },
      provider: 'local',
    }
    const payloads = new Map([
      ['/proxy/release.json', Buffer.from(JSON.stringify(release))],
      ['/proxy/index.html', appBytes],
      ['/proxy/release-build.json', provenanceBytes],
    ])
    const calls: Array<[string, string, string]> = []
    const transport = async (url: URL, options: RequestInit) => {
      calls.push([url.href, String(options.cache), String(options.redirect)])
      const bytes = payloads.get(url.pathname) ?? Buffer.from('missing')
      return new Response(bytes, {
        status: payloads.has(url.pathname) ? 200 : 404,
        headers: {
          'content-type': url.pathname.endsWith('.json') ? 'application/json' : 'text/html',
        },
      })
    }

    const result = await verifyPublicRelease({
      publicUrl: 'https://example.test/proxy///',
      expectedCommit: commit.toUpperCase(),
      fetchImpl: transport,
    })
    expect(result.url).toBe('https://example.test/proxy')
    expect(calls.every(([, cache, redirect]) => cache === 'no-store' && redirect === 'error')).toBe(true)

    const tooLargeJson = Buffer.alloc(MAX_RELEASE_JSON_BYTES + 1, 0x20)
    await expectRejected(() => verifyPublicRelease({
      publicUrl: 'https://example.test/proxy',
      expectedCommit: commit,
      fetchImpl: async () => new Response(tooLargeJson, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    }))
  })
})
