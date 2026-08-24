import { createHash } from 'node:crypto'
import { resolve4, resolve6 } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import https from 'node:https'

export const RELEASE_BUILD_FILE = 'release-build.json'
export const RELEASE_METADATA_FILE = 'release.json'
export const ALLOWED_PROVIDERS = new Set(['github-pages', 'netlify', 'local'])
export const MAX_MANIFEST_FILES = 2048
export const MAX_MANIFEST_PATH_LENGTH = 512
export const MAX_DECLARED_FILE_BYTES = 40_000_000
export const MAX_DECLARED_TOTAL_BYTES = 40_000_000
export const MAX_RELEASE_JSON_BYTES = 1_048_576
export const MAX_RELEASE_BUILD_JSON_BYTES = 1_048_576
export const REQUEST_TIMEOUT_MS = 15_000
export const OVERALL_TIMEOUT_MS = 60_000

const FETCH_OPTIONS = Object.freeze({
  cache: 'no-store',
  redirect: 'error',
  headers: Object.freeze({
    accept: 'application/json, */*',
    'cache-control': 'no-cache',
    'accept-encoding': 'identity',
  }),
})

class PublicReleaseVerificationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PublicReleaseVerificationError'
  }
}

const fail = (message) => {
  throw new PublicReleaseVerificationError(message)
}

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
)

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex')

export const hashManifestFiles = (files) => sha256Hex(JSON.stringify(files))

const isSha256 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

export const normalizeExpectedReleaseSha256 = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    fail('PROXY_ZERO_EXPECTED_RELEASE_SHA256 is required.')
  }
  if (!isSha256(value)) {
    fail('PROXY_ZERO_EXPECTED_RELEASE_SHA256 must be a lowercase 64-character SHA-256 hex digest.')
  }
  return value
}

const validateManifestFile = (entry, index, label) => {
  if (!isPlainObject(entry)) fail(`${label}.files[${index}] must be an object.`)
  const keys = Object.keys(entry).sort()
  if (keys.length !== 3 || keys.join(',') !== 'path,sha256,size') {
    fail(`${label}.files[${index}] must contain only path, size, and sha256.`)
  }
  if (
    typeof entry.path !== 'string'
    || entry.path.length === 0
    || entry.path.length > MAX_MANIFEST_PATH_LENGTH
    || entry.path.startsWith('/')
    || entry.path.includes('\\')
    || entry.path.includes('%')
    || entry.path.includes('?')
    || entry.path.includes('#')
    || entry.path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail(`${label}.files[${index}] has an invalid path.`)
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    fail(`${label}.files[${index}] has an invalid size.`)
  }
  if (!isSha256(entry.sha256)) fail(`${label}.files[${index}] has an invalid sha256.`)
}

export const validateManifest = (manifest, label = 'manifest', { allowReleaseBuild = true } = {}) => {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.files)) {
    fail(`${label} must contain a files array.`)
  }
  if (manifest.files.length === 0 || manifest.files.length > MAX_MANIFEST_FILES) {
    fail(`${label}.files count is outside the allowed range.`)
  }
  if (!isSha256(manifest.manifestSha256)) {
    fail(`${label}.manifestSha256 is invalid.`)
  }

  const paths = new Set()
  let totalSize = 0
  manifest.files.forEach((entry, index) => {
    validateManifestFile(entry, index, label)
    if (paths.has(entry.path)) fail(`${label}.files contains a duplicate path.`)
    paths.add(entry.path)
    if (index > 0 && manifest.files[index - 1].path.localeCompare(entry.path, 'en') >= 0) {
      fail(`${label}.files must use ascending canonical path order.`)
    }
    if (!allowReleaseBuild && entry.path === RELEASE_BUILD_FILE) {
      fail(`${label} must not contain ${RELEASE_BUILD_FILE}.`)
    }
    if (entry.path === RELEASE_METADATA_FILE) {
      fail(`${label} must not contain ${RELEASE_METADATA_FILE}.`)
    }
    if (entry.size > MAX_DECLARED_FILE_BYTES) {
      fail(`${label}.files[${index}] exceeds the per-file size limit.`)
    }
    totalSize += entry.size
    if (totalSize > MAX_DECLARED_TOTAL_BYTES) {
      fail(`${label}.files exceeds the total declared size limit.`)
    }
  })

  if (manifest.manifestSha256 !== hashManifestFiles(manifest.files)) {
    fail(`${label}.manifestSha256 does not match its files.`)
  }
  return manifest
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, canonicalize(child)]),
  )
}

export const equalJsonValue = (left, right) => (
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
)

const isLoopbackHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '0.0.0.0'
  ) return true
  const octets = normalized.split('.')
  return octets.length === 4
    && octets.every((octet) => /^\d+$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
    && Number(octets[0]) === 127
}

const isLoginPath = (pathname) => pathname
  .split('/')
  .filter(Boolean)
  .some((segment) => /^(?:login|signin|sign-in)$/i.test(segment))

const isDocumentPath = (pathname) => {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '')
  const lastSegment = withoutTrailingSlash.slice(withoutTrailingSlash.lastIndexOf('/') + 1)
  return /\.[a-z0-9]{1,12}$/i.test(lastSegment)
}

/**
 * Validate and normalize the public site base URL. Queries/fragments are
 * rejected so a copied token can never be sent to the release host.
 */
export const normalizePublicUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0) fail('PROXY_ZERO_PUBLIC_URL is required.')

  let url
  try {
    url = new URL(value)
  } catch {
    fail('PROXY_ZERO_PUBLIC_URL must be a valid HTTPS URL.')
  }
  if (url.protocol !== 'https:') fail('PROXY_ZERO_PUBLIC_URL must use HTTPS.')
  if (url.username || url.password) fail('PROXY_ZERO_PUBLIC_URL must not contain credentials.')
  if (url.search || url.hash) fail('PROXY_ZERO_PUBLIC_URL must not contain a query or fragment.')
  if (isLoopbackHostname(url.hostname)) fail('PROXY_ZERO_PUBLIC_URL must not target localhost.')
  if (isLoginPath(url.pathname)) fail('PROXY_ZERO_PUBLIC_URL must not target a login URL.')
  if (isDocumentPath(url.pathname)) fail('PROXY_ZERO_PUBLIC_URL must be a site base path, not a document.')

  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url
}

export const publicUrlForOutput = (url) => `${url.origin}${url.pathname}`

const releaseJsonUrl = (baseUrl) => {
  const url = new URL(baseUrl)
  url.pathname = `${url.pathname.replace(/\/+$/, '') || ''}/release.json` || '/release.json'
  return url
}

const publicFileUrl = (baseUrl, filePath) => {
  const root = new URL(baseUrl)
  root.pathname = `${root.pathname.replace(/\/+$/, '') || ''}/`
  let url
  try {
    url = new URL(filePath, root)
  } catch {
    fail('A manifest file path is not a valid URL path.')
  }
  if (url.origin !== root.origin || url.search || url.hash) {
    fail('A manifest file path escapes the public release origin.')
  }
  const rootPath = root.pathname
  if (!url.pathname.startsWith(rootPath)) fail('A manifest file path escapes the public release path.')
  return url
}

const parseJsonBytes = (bytes, label) => {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    fail(`${label} is not valid JSON.`)
  }
}

const isJsonContentType = (contentType) => {
  if (typeof contentType !== 'string') return false
  const mime = contentType.split(';', 1)[0].trim().toLowerCase()
  return mime === 'application/json' || mime.endsWith('+json')
}

const getContentType = (response) => response?.headers?.get?.('content-type') ?? null

const destroyResponseBody = async (response) => {
  try {
    if (typeof response?.body?.cancel === 'function') await response.body.cancel()
    else if (typeof response?.body?.destroy === 'function') response.body.destroy()
    else if (typeof response?.close === 'function') response.close()
  } catch {
    // The original validation error is more useful than a cleanup error.
  }
}

const bodyChunks = async function* (body) {
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) return
        yield next.value
      }
    } finally {
      reader.releaseLock?.()
    }
    return
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    yield* body
    return
  }
  fail('The public release response did not provide a stream body.')
}

const readResponseBody = async (response, label, maxBytes, keepBody) => {
  const digest = createHash('sha256')
  const chunks = keepBody ? [] : null
  let size = 0
  try {
    for await (const chunk of bodyChunks(response.body)) {
      const chunkSize = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk?.byteLength
      if (!Number.isSafeInteger(chunkSize) || chunkSize < 0 || size + chunkSize > maxBytes) {
        await destroyResponseBody(response)
        fail(`${label} response exceeds its decoded-byte cap.`)
      }
      const bytes = Buffer.from(chunk)
      size += chunkSize
      digest.update(bytes)
      if (chunks) chunks.push(bytes)
    }
  } catch (error) {
    if (error instanceof PublicReleaseVerificationError) throw error
    fail(`${label} response body could not be read.`)
  }
  return {
    size,
    sha256: digest.digest('hex'),
    bytes: chunks ? Buffer.concat(chunks, size) : null,
  }
}

const timeoutMarker = Symbol('request-timeout')

const withRequestTimeout = async (task, label, deadline) => {
  const remaining = Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())
  if (remaining <= 0) fail('Public release verification exceeded its overall timeout.')
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(timeoutMarker)
    }, remaining)
  })
  try {
    return await Promise.race([task(controller.signal), timeout])
  } catch (error) {
    if (error === timeoutMarker) fail(`${label} request timed out.`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const requestOptions = (signal) => ({
  ...FETCH_OPTIONS,
  headers: { ...FETCH_OPTIONS.headers },
  signal,
})

const fetchResource = async (
  url,
  fetchImpl,
  label,
  deadline,
  { json = false, maxBytes = MAX_DECLARED_FILE_BYTES, keepBody = false } = {},
) => withRequestTimeout(async (signal) => {
  let response
  try {
    response = await fetchImpl(url, requestOptions(signal))
  } catch {
    fail(`${label} request failed.`)
  }
  if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    await destroyResponseBody(response)
    fail(`${label} returned an invalid HTTP status.`)
  }
  if (json && !isJsonContentType(getContentType(response))) {
    await destroyResponseBody(response)
    fail(`${label} returned an invalid content type.`)
  }
  return readResponseBody(response, label, maxBytes, keepBody)
}, label, deadline)

const fetchJsonResource = async (url, fetchImpl, label, deadline, maxBytes, expectedSha256) => {
  const resource = await fetchResource(url, fetchImpl, label, deadline, {
    json: true,
    maxBytes,
    keepBody: true,
  })
  if (typeof expectedSha256 === 'string' && resource.sha256 !== expectedSha256) {
    fail(`${label} sha256 does not match PROXY_ZERO_EXPECTED_RELEASE_SHA256.`)
  }
  return { value: parseJsonBytes(resource.bytes, label), sha256: resource.sha256 }
}

const parseIpv4Octets = (value) => {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null
  const octets = value.split('.').map(Number)
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null
}

const ipv4IsGlobal = (octets) => {
  const [first, second, third, fourth] = octets
  if (first === 0) return false
  if (first === 10 || first === 127 || first >= 224 || first >= 240) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (first === 192 && second === 0) return false
  if (first === 192 && second === 0 && third === 2) return false
  if (first === 192 && second === 88 && third === 99) return false
  if (first === 192 && second === 168) return false
  if (first === 198 && second >= 18 && second <= 19) return false
  if (first === 198 && second === 51 && third === 100) return false
  if (first === 203 && second === 0 && third === 113) return false
  if (first === 255 && second === 255 && third === 255 && fourth === 255) return false
  return true
}

const parseIpv6Bytes = (value) => {
  if (typeof value !== 'string') return null
  let text = value.toLowerCase()
  if (text.includes('.')) {
    const separator = text.lastIndexOf(':')
    const octets = parseIpv4Octets(text.slice(separator + 1))
    if (!octets || separator < 0) return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${text.slice(0, separator + 1)}${high}:${low}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : []
  if (left.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  if (right.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  const groups = halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : [...left]
  if (groups.length !== 8) return null
  const bytes = new Uint8Array(16)
  groups.forEach((group, index) => {
    const number = Number.parseInt(group, 16)
    bytes[index * 2] = number >> 8
    bytes[index * 2 + 1] = number & 0xff
  })
  return bytes
}

const prefixMatches = (bytes, prefix, bits) => {
  const fullBytes = Math.floor(bits / 8)
  const remainingBits = bits % 8
  for (let index = 0; index < fullBytes; index += 1) {
    if (bytes[index] !== prefix[index]) return false
  }
  if (remainingBits === 0) return true
  const mask = 0xff << (8 - remainingBits)
  return (bytes[fullBytes] & mask) === (prefix[fullBytes] & mask)
}

const allZero = (bytes) => bytes.every((byte) => byte === 0)

const mappedIpv4Octets = (bytes) => {
  if (!prefixMatches(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96)) return null
  return [bytes[12], bytes[13], bytes[14], bytes[15]]
}

const ipv6IsGlobal = (bytes) => {
  const mapped = mappedIpv4Octets(bytes)
  if (mapped) return ipv4IsGlobal(mapped)
  if (allZero(bytes) || (allZero(bytes.slice(0, 15)) && bytes[15] === 1)) return false
  if (bytes[0] === 0xff) return false
  if ((bytes[0] & 0xfe) === 0xfc) return false
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false
  // IANA's 2001::/23 special-purpose block contains only narrowly assigned
  // exceptions. A release host does not need those anycast/transition ranges,
  // so fail closed for the whole block instead of risking an incomplete list.
  if (prefixMatches(bytes, [0x20, 0x01, 0x00], 23)) return false
  if (prefixMatches(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return false // Documentation
  if (bytes[0] === 0x3f && (bytes[1] & 0xf0) === 0xf0) return false // Documentation
  if (bytes[0] !== 0x20 && (bytes[0] & 0xe0) !== 0x20) return false
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return ipv4IsGlobal(Array.from(bytes.slice(2, 6))) // 6to4 embeds IPv4
  }
  return true
}

/** Return only classification data; callers never need to log the address. */
export const classifyIpAddress = (address) => {
  const unbracketed = typeof address === 'string' ? address.replace(/^\[|\]$/g, '') : ''
  const family = isIP(unbracketed)
  if (family === 4) {
    const octets = parseIpv4Octets(unbracketed)
    return { family, isGlobal: octets !== null && ipv4IsGlobal(octets) }
  }
  if (family === 6) {
    const bytes = parseIpv6Bytes(unbracketed)
    return { family, isGlobal: bytes !== null && ipv6IsGlobal(bytes) }
  }
  return { family: 0, isGlobal: false }
}

export const isGlobalIpAddress = (address) => classifyIpAddress(address).isGlobal

const dnsNoData = new Set(['ENODATA', 'NODATA', 'ENOTFOUND'])

export const resolvePublicAddresses = async (hostname) => {
  const normalizedHost = typeof hostname === 'string'
    ? hostname.replace(/^\[|\]$/g, '')
    : ''
  const literalFamily = isIP(normalizedHost)
  if (literalFamily) {
    if (!isGlobalIpAddress(normalizedHost)) fail('Public URL address is not globally routable.')
    return [{ address: normalizedHost, family: literalFamily }]
  }
  if (!normalizedHost) fail('Public URL host is invalid.')

  const results = await Promise.allSettled([
    resolve4(normalizedHost),
    resolve6(normalizedHost),
  ])
  const addresses = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const family = index === 0 ? 4 : 6
      result.value.forEach((address) => addresses.push({ address, family }))
      return
    }
    if (!dnsNoData.has(result.reason?.code)) fail('Public URL DNS resolution failed.')
  })
  const unique = Array.from(new Map(addresses.map((entry) => [entry.address, entry])).values())
  if (unique.length === 0) fail('Public URL DNS resolution returned no address.')
  if (unique.some((entry) => !isGlobalIpAddress(entry.address))) {
    fail('Public URL DNS returned a non-global address.')
  }
  return unique
}

const responseHeaders = (headers) => ({
  get(name) {
    const wanted = name.toLowerCase()
    const value = headers[wanted]
    return Array.isArray(value) ? value.join(', ') : value ?? null
  },
})

const pinnedHttpsRequest = (baseUrl, pinnedAddresses, selectAddress, url, options) => {
  if (
    url.protocol !== 'https:'
    || url.hostname !== baseUrl.hostname
    || url.port !== baseUrl.port
  ) {
    fail('Public release request escaped the validated HTTPS origin.')
  }
  const selected = selectAddress()
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  return new Promise((resolveResponse, reject) => {
    let request
    try {
      request = https.request({
        hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          ...options.headers,
          host: url.host,
        },
        lookup: (_host, lookupOptions, callback) => {
          if (lookupOptions.all) {
            callback(null, pinnedAddresses.map((entry) => ({ ...entry })))
          } else {
            callback(null, selected.address, selected.family)
          }
        },
        servername: isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: true,
        signal: options.signal,
      }, (response) => {
        resolveResponse({
          status: response.statusCode ?? 0,
          headers: responseHeaders(response.headers),
          body: response,
          close: () => response.destroy(),
        })
      })
    } catch {
      reject(new Error('https request setup failed'))
      return
    }
    request.once('error', reject)
    request.end()
  })
}

export const createProductionTransport = async (baseUrl, deadline = Date.now() + OVERALL_TIMEOUT_MS) => {
  const addresses = await withRequestTimeout(
    () => resolvePublicAddresses(baseUrl.hostname),
    'Public URL DNS resolution',
    deadline,
  )
  let nextIndex = 0
  return (url, options) => pinnedHttpsRequest(
    baseUrl,
    addresses,
    () => addresses[nextIndex++ % addresses.length],
    url,
    options,
  )
}

const validateReleaseMetadata = (release, expectedCommit) => {
  if (!isPlainObject(release)) fail('release.json must contain an object.')
  if (release.schemaVersion !== 2) fail('release.json schemaVersion must be 2.')
  if (release.commit !== expectedCommit) fail('release.json commit does not match the expected commit.')
  if (release.dirty !== false) fail('release.json dirty must be false.')
  if (!ALLOWED_PROVIDERS.has(release.provider)) fail('release.json provider is invalid.')
  // Deliberately do not bind provider to the host: manual Netlify fallback
  // publishes a locally stamped bundle with provider="local".
  if (release.buildProvenance !== RELEASE_BUILD_FILE) {
    fail('release.json build provenance is invalid.')
  }
  validateManifest(release.appBundle, 'release.json appBundle', { allowReleaseBuild: false })
  validateManifest(release.publicManifest, 'release.json publicManifest')
  return release
}

const validatePublicManifestRelationship = (release) => {
  const publicFiles = new Map(release.publicManifest.files.map((entry) => [entry.path, entry]))
  if (!publicFiles.has(RELEASE_BUILD_FILE)) {
    fail(`release.json publicManifest must include ${RELEASE_BUILD_FILE}.`)
  }
  if (publicFiles.has(RELEASE_METADATA_FILE)) {
    fail(`release.json publicManifest must exclude ${RELEASE_METADATA_FILE}.`)
  }

  const expected = new Map(release.appBundle.files.map((entry) => [entry.path, entry]))
  expected.set(RELEASE_BUILD_FILE, publicFiles.get(RELEASE_BUILD_FILE))
  if (expected.size !== publicFiles.size) {
    fail('release.json appBundle and publicManifest do not describe the same release.')
  }
  for (const [path, entry] of expected) {
    if (!publicFiles.has(path) || !equalJsonValue(entry, publicFiles.get(path))) {
      fail('release.json appBundle and publicManifest do not describe the same release.')
    }
  }
}

const verifyProvenance = (provenance, release, expectedCommit) => {
  if (!isPlainObject(provenance)) fail(`${RELEASE_BUILD_FILE} must contain an object.`)
  if (provenance.schemaVersion !== release.schemaVersion || provenance.schemaVersion !== 2) {
    fail(`${RELEASE_BUILD_FILE} schemaVersion does not match release.json.`)
  }
  if (provenance.commit !== expectedCommit || provenance.commit !== release.commit) {
    fail(`${RELEASE_BUILD_FILE} commit does not match release.json.`)
  }
  if (provenance.dirty !== false || provenance.dirty !== release.dirty) {
    fail(`${RELEASE_BUILD_FILE} dirty does not match release.json.`)
  }
  if (
    typeof provenance.builtAt !== 'string'
    || Number.isNaN(Date.parse(provenance.builtAt))
    || !/^\d{4}-\d{2}-\d{2}T/.test(provenance.builtAt)
  ) {
    fail(`${RELEASE_BUILD_FILE} builtAt is not a valid ISO timestamp.`)
  }
  if (!equalJsonValue(provenance.appBundle, release.appBundle)) {
    fail(`${RELEASE_BUILD_FILE} appBundle does not match release.json.`)
  }
}

/**
 * Verify a deployed release. `fetchImpl` is injectable so the whole check can
 * run against an in-memory fixture without making network or cloud changes.
 */
export const verifyPublicRelease = async ({
  publicUrl,
  expectedCommit,
  expectedReleaseSha256,
  fetchImpl,
} = {}) => {
  const deadline = Date.now() + OVERALL_TIMEOUT_MS
  const baseUrl = normalizePublicUrl(publicUrl)
  if (typeof expectedCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    fail('PROXY_ZERO_EXPECTED_COMMIT must be a full 40-character Git commit.')
  }
  const normalizedCommit = expectedCommit.toLowerCase()
  const normalizedReleaseSha256 = normalizeExpectedReleaseSha256(expectedReleaseSha256)
  if (typeof fetchImpl !== 'undefined' && typeof fetchImpl !== 'function') {
    fail('A fetch implementation is unavailable.')
  }

  const transport = typeof fetchImpl === 'function'
    ? fetchImpl
    : await createProductionTransport(baseUrl, deadline)

  const releaseUrl = releaseJsonUrl(baseUrl)
  const { value: release, sha256: releaseJsonSha256 } = await fetchJsonResource(
    releaseUrl,
    transport,
    RELEASE_METADATA_FILE,
    deadline,
    MAX_RELEASE_JSON_BYTES,
    normalizedReleaseSha256,
  )
  validateReleaseMetadata(release, normalizedCommit)
  validatePublicManifestRelationship(release)

  let provenanceBytes = null
  let actualTotalSize = 0
  for (const [index, entry] of release.publicManifest.files.entries()) {
    const fileUrl = publicFileUrl(baseUrl, entry.path)
    const resource = await fetchResource(
      fileUrl,
      transport,
      `publicManifest.files[${index}]`,
      deadline,
      {
        json: entry.path === RELEASE_BUILD_FILE,
        maxBytes: entry.path === RELEASE_BUILD_FILE
          ? Math.min(MAX_RELEASE_BUILD_JSON_BYTES, entry.size + 1)
          : Math.min(MAX_DECLARED_FILE_BYTES, entry.size + 1),
        keepBody: entry.path === RELEASE_BUILD_FILE,
      },
    )
    if (resource.size !== entry.size) {
      fail(`publicManifest.files[${index}] size does not match.`)
    }
    actualTotalSize += resource.size
    if (actualTotalSize > MAX_DECLARED_TOTAL_BYTES) {
      fail('Public release response bytes exceed the total size limit.')
    }
    if (resource.sha256 !== entry.sha256) {
      fail(`publicManifest.files[${index}] sha256 does not match.`)
    }
    if (entry.path === RELEASE_BUILD_FILE) provenanceBytes = resource.bytes
  }

  if (release.publicManifest.manifestSha256 !== hashManifestFiles(release.publicManifest.files)) {
    fail('release.json publicManifest manifestSha256 does not match its files.')
  }
  if (!provenanceBytes) fail(`${RELEASE_BUILD_FILE} was not fetched.`)
  verifyProvenance(parseJsonBytes(provenanceBytes, RELEASE_BUILD_FILE), release, normalizedCommit)

  return {
    url: publicUrlForOutput(baseUrl),
    commit: release.commit,
    provider: release.provider,
    fileCount: release.publicManifest.files.length,
    releaseJsonSha256,
    appBundleSha256: release.appBundle.manifestSha256,
    publicManifestSha256: release.publicManifest.manifestSha256,
    releaseBuildSha256: release.publicManifest.files.find((entry) => entry.path === RELEASE_BUILD_FILE).sha256,
  }
}

export const verifyPublicReleaseFromEnv = (env = process.env, fetchImpl) => (
  verifyPublicRelease({
    publicUrl: env.PROXY_ZERO_PUBLIC_URL,
    expectedCommit: env.PROXY_ZERO_EXPECTED_COMMIT,
    expectedReleaseSha256: env.PROXY_ZERO_EXPECTED_RELEASE_SHA256,
    ...(typeof fetchImpl === 'function' ? { fetchImpl } : {}),
  })
)

const printSuccess = (summary) => {
  console.log(`[qa:public] PASS url=${summary.url}`)
  console.log(`[qa:public] commit=${summary.commit} provider=${summary.provider} files=${summary.fileCount}`)
  console.log(
    `[qa:public] releaseJsonSha256=${summary.releaseJsonSha256} appBundleSha256=${summary.appBundleSha256} publicManifestSha256=${summary.publicManifestSha256} releaseBuildSha256=${summary.releaseBuildSha256}`,
  )
}

const isMainModule = () => {
  if (!process.argv[1]) return false
  return fileURLToPath(import.meta.url) === resolve(process.argv[1])
}

if (isMainModule()) {
  verifyPublicReleaseFromEnv()
    .then(printSuccess)
    .catch((error) => {
      const message = error instanceof PublicReleaseVerificationError
        ? error.message
        : 'public release verification failed.'
      console.error(`[qa:public] FAIL ${message}`)
      process.exitCode = 1
    })
}
