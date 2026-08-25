import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PNG } from 'pngjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const sourceRoot = join(projectRoot, 'art', 'source', 'task13')

const argValue = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}
const outputRoot = resolve(argValue('--out-dir') ?? join(projectRoot, 'public', 'assets', 'sprites'))

const profileSpecs = [
  { id: 'han', sheet: 'players', source: 'han-poses-keyed.png', row: null, targetHeight: 120 },
  { id: 'mina', sheet: 'players', source: 'mina-poses-keyed.png', row: null, targetHeight: 114 },
  { id: 'jin', sheet: 'players', source: 'jin-poses-keyed.png', row: null, targetHeight: 124 },
  { id: 'scout-striker', sheet: 'enemies', source: 'roster-poses-keyed.png', row: 3, targetHeight: 104 },
  { id: 'scout-patrol', sheet: 'enemies', source: 'roster-poses-keyed.png', row: 4, targetHeight: 100 },
  { id: 'bulwark-sentinel', sheet: 'enemies', source: 'roster-poses-keyed.png', row: 5, targetHeight: 128 },
  { id: 'bulwark-enforcer', sheet: 'enemies', source: 'roster-poses-keyed.png', row: 6, targetHeight: 124 },
  { id: 'elite-bulwark-frame', sheet: 'enemies', source: 'roster-poses-keyed.png', row: 7, targetHeight: 136 },
  { id: 'boss-silo-dredger', sheet: 'boss', source: 'roster-poses-keyed.png', row: 8, targetHeight: 172 },
]

const sheetSpecs = {
  players: { image: 'actors_players.png', cell: { width: 256, height: 256 }, columns: 8 },
  enemies: { image: 'actors_enemies.png', cell: { width: 256, height: 256 }, columns: 8 },
  boss: { image: 'actor_boss.png', cell: { width: 384, height: 384 }, columns: 8 },
}

const playerAttackIds = {
  han: [
    'han-right-hand', 'han-left-hand', 'han-right-foot', 'han-left-foot',
    'han-cross-strike', 'han-rising-kick', 'han-jump-kick', 'han-iron-tempest',
  ],
  mina: [
    'mina-right-hand', 'mina-left-hand', 'mina-right-foot', 'mina-left-foot',
    'mina-flash-step', 'mina-sky-needle', 'mina-jump-heel', 'mina-prism-rush',
  ],
  jin: [
    'jin-right-hand', 'jin-left-hand', 'jin-right-foot', 'jin-left-foot',
    'jin-anchor-blow', 'jin-fault-line', 'jin-jump-crush', 'jin-zero-breaker',
  ],
}

/**
 * Approved direct-limb art. Null slots are superseded generations retained in
 * the source strip only to keep the authored spacing deterministic.
 */
const playerAttackSourceSpecs = {
  han: [
    {
      source: 'han-limb-attacks-keyed.png',
      poseNames: ['left-hand', null, 'left-foot-a', 'left-foot-b'],
    },
    { source: 'han-right-hand-keyed.png', poseNames: ['right-hand'] },
    { source: 'han-right-foot-keyed.png', poseNames: ['right-foot'] },
  ],
  mina: [
    {
      source: 'mina-limb-attacks-keyed.png',
      poseNames: ['left-hand', null, 'left-foot-a', 'left-foot-b', 'right-foot'],
    },
    { source: 'mina-right-hand-keyed.png', poseNames: ['right-hand'] },
  ],
  jin: [
    {
      source: 'jin-limb-attacks-keyed.png',
      poseNames: ['left-hand', null, 'left-foot-a', 'left-foot-b', null],
    },
    { source: 'jin-right-hand-keyed.png', poseNames: ['right-hand'] },
    {
      source: 'jin-right-foot-and-charge-keyed.png',
      poseNames: ['right-foot', 'shoulder-charge'],
    },
  ],
}

const playerLocomotionSourceSpecs = {
  han: {
    walk: 'han-walk-keyed-v2.png',
    run: 'han-run-keyed-v2.png',
  },
  mina: {
    walk: 'mina-walk-keyed-v2.png',
    run: 'mina-run-keyed-v2.png',
  },
  jin: {
    walk: 'jin-walk-keyed-v2.png',
    run: 'jin-run-keyed-v2.png',
  },
}

const PLAYER_WALK_FPS = 9
const PLAYER_RUN_FPS = 14
const PLAYER_LOCOMOTION_FRAMES = 6

const enemyAttacks = {
  'scout-striker': [
    ['scout-striker-jab', 'han-right-hand'],
    ['scout-striker-sweep', 'han-left-foot'],
  ],
  'scout-patrol': [['scout-patrol-kick', 'han-right-foot']],
  'bulwark-sentinel': [['bulwark-sentinel-slam', 'jin-anchor-blow']],
  'bulwark-enforcer': [
    ['bulwark-enforcer-punch', 'han-left-hand'],
    ['bulwark-enforcer-charge', 'han-rising-kick'],
  ],
  'elite-bulwark-frame': [
    ['elite-rail-hammer', 'elite-rail-hammer'],
    ['elite-lane-charge', 'elite-lane-charge'],
  ],
  'boss-silo-dredger': [
    ['boss-dredger-slam', 'boss-dredger-slam'],
    ['boss-floodline-charge', 'boss-floodline-charge'],
  ],
}

const parseSource = async (name) => PNG.sync.read(await readFile(join(sourceRoot, name)))

const pixelIndex = (width, x, y) => (y * width + x) * 4

const isStrongForeground = (data, index) => data[index + 3] > 32

const sampleKeyColor = (png) => {
  const samples = [
    [0, 0], [png.width - 1, 0],
    [0, png.height - 1], [png.width - 1, png.height - 1],
  ]
  const sum = samples.reduce((value, [x, y]) => {
    const index = pixelIndex(png.width, x, y)
    return [
      value[0] + png.data[index],
      value[1] + png.data[index + 1],
      value[2] + png.data[index + 2],
    ]
  }, [0, 0, 0])
  return sum.map((value) => value / samples.length)
}

/** Converts a uniform chroma-key source into clean alpha with a soft one-pixel edge. */
const removeKeyBackground = (png) => {
  const key = sampleKeyColor(png)
  for (let flat = 0; flat < png.width * png.height; flat += 1) {
    const index = flat * 4
    const distance = Math.hypot(
      png.data[index] - key[0],
      png.data[index + 1] - key[1],
      png.data[index + 2] - key[2],
    )
    if (distance <= 88) {
      png.data[index + 3] = 0
    } else if (distance < 150) {
      png.data[index + 3] = Math.round(((distance - 88) / 62) * png.data[index + 3])
    }
  }
  return png
}

const crop = (source, left, top, width, height) => {
  const result = new PNG({ width, height })
  PNG.bitblt(source, result, left, top, width, height, 0, 0)
  return result
}

/** Finds projection valleys while keeping every slot within authored size limits. */
const adaptiveBoundaries = (png, axis, segments, minSize, maxSize) => {
  const length = axis === 'x' ? png.width : png.height
  const crossLength = axis === 'x' ? png.height : png.width
  const scores = Array.from({ length }, () => 0)
  for (let coordinate = 0; coordinate < length; coordinate += 1) {
    let score = 0
    for (let cross = 0; cross < crossLength; cross += 1) {
      const x = axis === 'x' ? coordinate : cross
      const y = axis === 'x' ? cross : coordinate
      if (isStrongForeground(png.data, pixelIndex(png.width, x, y))) score += 1
    }
    scores[coordinate] = score
  }

  const boundaries = [0]
  let prior = 0
  for (let slot = 1; slot < segments; slot += 1) {
    const remaining = segments - slot
    const low = Math.max(prior + minSize, length - remaining * maxSize)
    const high = Math.min(prior + maxSize, length - remaining * minSize)
    const expected = (slot * length) / segments
    let best = low
    let bestCost = Number.POSITIVE_INFINITY
    for (let candidate = low; candidate <= high; candidate += 1) {
      let projectionCost = 0
      for (let offset = -2; offset <= 2; offset += 1) {
        projectionCost += scores[Math.max(0, Math.min(length - 1, candidate + offset))]
      }
      const cost = projectionCost + Math.abs(candidate - expected) * 0.25
      if (cost < bestCost) {
        best = candidate
        bestCost = cost
      }
    }
    boundaries.push(best)
    prior = best
  }
  boundaries.push(length)
  return boundaries
}

const componentGap = (primary, candidate) => {
  const gapX = Math.max(
    0,
    primary.minX - candidate.maxX - 1,
    candidate.minX - primary.maxX - 1,
  )
  const gapY = Math.max(
    0,
    primary.minY - candidate.maxY - 1,
    candidate.minY - primary.maxY - 1,
  )
  return Math.hypot(gapX, gapY)
}

/** Drops isolated specks and only the proven edge-cut remnants from player pose six. */
const retainActorComponents = (png, removeDistantEdgeFragments = false) => {
  const visited = new Uint8Array(png.width * png.height)
  const components = []
  const queue = new Int32Array(png.width * png.height)
  for (let seed = 0; seed < visited.length; seed += 1) {
    if (visited[seed] || png.data[seed * 4 + 3] <= 8) continue
    let head = 0
    let tail = 0
    const pixels = []
    let minX = png.width
    let minY = png.height
    let maxX = -1
    let maxY = -1
    visited[seed] = 1
    queue[tail++] = seed
    while (head < tail) {
      const flat = queue[head++]
      pixels.push(flat)
      const x = flat % png.width
      const y = Math.floor(flat / png.width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue
          const px = x + ox
          const py = y + oy
          if (px < 0 || px >= png.width || py < 0 || py >= png.height) continue
          const next = py * png.width + px
          if (visited[next] || png.data[next * 4 + 3] <= 8) continue
          visited[next] = 1
          queue[tail++] = next
        }
      }
    }
    components.push({ pixels, minX, minY, maxX, maxY })
  }
  components.sort((left, right) => right.pixels.length - left.pixels.length)
  const primary = components[0]
  const largest = primary?.pixels.length ?? 0
  const minimum = Math.max(24, Math.ceil(largest * 0.015))
  for (const component of components) {
    const touchesSliceEdge = component.minX === 0 || component.maxX === png.width - 1
    const isDistantEdgeFragment =
      removeDistantEdgeFragments &&
      component !== primary &&
      touchesSliceEdge &&
      componentGap(primary, component) > 48
    if (component.pixels.length >= minimum && !isDistantEdgeFragment) continue
    for (const flat of component.pixels) png.data[flat * 4 + 3] = 0
  }
  return png
}

const alphaBounds = (png) => {
  let minX = png.width
  let minY = png.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[pixelIndex(png.width, x, y) + 3] < 12) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('Source slot contains no actor pixels.')
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

const normalizePose = (source, scale, cell) => {
  const bounds = alphaBounds(source)
  const width = Math.max(1, Math.round(bounds.width * scale))
  const height = Math.max(1, Math.round(bounds.height * scale))
  if (width > cell.width || height > cell.height) {
    throw new Error(`Normalized pose ${width}x${height} exceeds ${cell.width}x${cell.height}.`)
  }
  const result = new PNG({ width: cell.width, height: cell.height })
  const offsetX = Math.floor((cell.width - width) / 2)
  const offsetY = cell.height - height
  for (let y = 0; y < height; y += 1) {
    const sourceY = bounds.y + Math.min(bounds.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x += 1) {
      const sourceX = bounds.x + Math.min(bounds.width - 1, Math.floor(x / scale))
      const from = pixelIndex(source.width, sourceX, sourceY)
      const to = pixelIndex(result.width, offsetX + x, offsetY + y)
      result.data[to] = source.data[from]
      result.data[to + 1] = source.data[from + 1]
      result.data[to + 2] = source.data[from + 2]
      result.data[to + 3] = source.data[from + 3]
    }
  }
  return result
}

/**
 * Applies one authored strip coordinate system to every frame. Unlike normalizePose,
 * this keeps the shared root and baseline instead of independently centering and
 * bottom-aligning each silhouette. Airborne run phases therefore stay airborne.
 */
const normalizePoseAtRoot = (source, scale, cell, sourceRootX, sourceBaselineY) => {
  const bounds = alphaBounds(source)
  const sourceRight = bounds.x + bounds.width - 1
  const sourceBottom = bounds.y + bounds.height - 1
  const left = Math.round(cell.width / 2 + (bounds.x - sourceRootX) * scale)
  const right = Math.round(cell.width / 2 + (sourceRight - sourceRootX) * scale)
  const top = Math.round(cell.height - 1 + (bounds.y - sourceBaselineY) * scale)
  const bottom = Math.round(cell.height - 1 + (sourceBottom - sourceBaselineY) * scale)
  if (left < 0 || right >= cell.width || top < 0 || bottom >= cell.height) {
    throw new Error(
      `Root-normalized pose ${left},${top}..${right},${bottom} exceeds ${cell.width}x${cell.height}.`,
    )
  }

  const result = new PNG({ width: cell.width, height: cell.height })
  const targetWidth = right - left + 1
  const targetHeight = bottom - top + 1
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = bounds.y + Math.min(
      bounds.height - 1,
      Math.floor((y * bounds.height) / targetHeight),
    )
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = bounds.x + Math.min(
        bounds.width - 1,
        Math.floor((x * bounds.width) / targetWidth),
      )
      const from = pixelIndex(source.width, sourceX, sourceY)
      const to = pixelIndex(result.width, left + x, top + y)
      result.data[to] = source.data[from]
      result.data[to + 1] = source.data[from + 1]
      result.data[to + 2] = source.data[from + 2]
      result.data[to + 3] = source.data[from + 3]
    }
  }
  return result
}

const poseExtents = (pose, cell) => {
  const bounds = alphaBounds(pose)
  return {
    left: cell.width / 2 - bounds.x,
    right: bounds.x + bounds.width - cell.width / 2,
  }
}

const basePoseKey = (index) => `base:${index}`
const attackPoseKey = (name) => `attack:${name}`
const locomotionPoseKey = (kind, index) => `locomotion:${kind}:${index}`

const clip = (profileId, id, state, poseKeys, extra = {}) => ({
  id,
  state,
  loop: state === 'idle' || state === 'walk' || state === 'run',
  frames: poseKeys.map((_, index) =>
    `${profileId}/${state === 'attack' || state === 'telegraph' ? `${state}/${id}` : id}/${String(index).padStart(2, '0')}`
  ),
  poseKeys,
  ...extra,
})

const buildClips = (profile) => {
  const playerLocomotion = playerLocomotionSourceSpecs[profile.id]
  const clips = [
    clip(profile.id, 'idle', 'idle', [basePoseKey(0), basePoseKey(0)]),
    playerLocomotion
      ? clip(
          profile.id,
          'walk',
          'walk',
          Array.from(
            { length: PLAYER_LOCOMOTION_FRAMES },
            (_, index) => locomotionPoseKey('walk', index),
          ),
          { fps: PLAYER_WALK_FPS },
        )
      : clip(profile.id, 'walk', 'walk', [
          basePoseKey(0), basePoseKey(1), basePoseKey(0), basePoseKey(1),
        ]),
    ...(playerLocomotion
      ? [clip(
          profile.id,
          'run',
          'run',
          Array.from(
            { length: PLAYER_LOCOMOTION_FRAMES },
            (_, index) => locomotionPoseKey('run', index),
          ),
          { fps: PLAYER_RUN_FPS },
        )]
      : []),
    clip(profile.id, 'airborne', 'airborne', [basePoseKey(2)]),
    clip(profile.id, 'hitstun', 'hitstun', [basePoseKey(5)]),
    clip(profile.id, 'knocked-down', 'knocked-down', [basePoseKey(6)]),
    clip(profile.id, 'getting-up', 'getting-up', [basePoseKey(6), basePoseKey(0)]),
    clip(profile.id, 'pickup-use', 'pickup-use', [basePoseKey(7), basePoseKey(7)]),
    clip(profile.id, 'defeated', 'defeated', [basePoseKey(6)]),
  ]
  const attackEntries = playerAttackIds[profile.id]
    ? playerAttackIds[profile.id].map((id) => [id, id])
    : enemyAttacks[profile.id]
  for (const [authoredAttackId, domainAttackId] of attackEntries ?? []) {
    const isKick = /foot|kick|sweep|charge|rush|line/.test(authoredAttackId)
    const isJump = /jump|sky/.test(authoredAttackId)
    const actionPose = isKick ? 4 : 3
    const directLimb = authoredAttackId.startsWith(`${profile.id}-`)
      ? authoredAttackId.slice(profile.id.length + 1)
      : ''
    const directPoseKeys = {
      'left-hand': [basePoseKey(0), attackPoseKey('left-hand'), attackPoseKey('left-hand')],
      'right-hand': [basePoseKey(0), attackPoseKey('right-hand'), attackPoseKey('right-hand')],
      'left-foot': [basePoseKey(0), attackPoseKey('left-foot-a'), attackPoseKey('left-foot-b')],
      'right-foot': [basePoseKey(0), attackPoseKey('right-foot'), attackPoseKey('right-foot')],
    }
    const poseKeys = playerAttackIds[profile.id] && directPoseKeys[directLimb]
      ? directPoseKeys[directLimb]
      : profile.id === 'jin' && authoredAttackId === 'jin-anchor-blow'
        ? [
            basePoseKey(0),
            attackPoseKey('shoulder-charge'),
            attackPoseKey('shoulder-charge'),
          ]
        : [basePoseKey(isJump ? 2 : 0), basePoseKey(actionPose), basePoseKey(actionPose)]
    clips.push(clip(profile.id, authoredAttackId, 'attack', poseKeys, {
      authoredAttackId,
      domainAttackId,
    }))
    if (!playerAttackIds[profile.id]) {
      clips.push(clip(profile.id, authoredAttackId, 'telegraph', [
        basePoseKey(7), basePoseKey(actionPose),
      ], {
        authoredAttackId,
        domainAttackId,
      }))
    }
  }
  return clips
}

const sourceCache = new Map()
const matrixRowCache = new Map()
const loadKeyedSource = async (name) => {
  let source = sourceCache.get(name)
  if (!source) {
    source = removeKeyBackground(await parseSource(name))
    sourceCache.set(name, source)
  }
  return source
}

const splitHorizontalPoses = (source, segments) => {
  if (segments === 1) {
    return [retainActorComponents(crop(source, 0, 0, source.width, source.height))]
  }
  const average = source.width / segments
  const boundaries = adaptiveBoundaries(
    source,
    'x',
    segments,
    Math.max(1, Math.floor(average * 0.6)),
    Math.ceil(average * 1.4),
  )
  return Array.from({ length: segments }, (_, column) => retainActorComponents(crop(
    source,
    boundaries[column],
    0,
    boundaries[column + 1] - boundaries[column],
    source.height,
  )))
}

const splitFixedHorizontalPoses = (source, segments) => {
  if (source.width % segments !== 0) {
    throw new Error(`Expected ${segments} equal horizontal slots, received ${source.width}px.`)
  }
  const slotWidth = source.width / segments
  return {
    slotWidth,
    poses: Array.from({ length: segments }, (_, column) => retainActorComponents(crop(
      source,
      column * slotWidth,
      0,
      slotWidth,
      source.height,
    ))),
  }
}

const loadPlayerAttackPoses = async (profile, poses, cell) => {
  for (const spec of playerAttackSourceSpecs[profile.id] ?? []) {
    const source = await loadKeyedSource(spec.source)
    const authoredPoses = splitHorizontalPoses(source, spec.poseNames.length)
    const scale = profile.targetHeight / alphaBounds(authoredPoses[0]).height
    spec.poseNames.forEach((poseName, index) => {
      if (!poseName) return
      poses.set(attackPoseKey(poseName), normalizePose(authoredPoses[index], scale, cell))
    })
  }
}

const loadPlayerLocomotionPoses = async (profile, poses, cell) => {
  const spec = playerLocomotionSourceSpecs[profile.id]
  if (!spec) return

  const walkSource = await loadKeyedSource(spec.walk)
  const runSource = await loadKeyedSource(spec.run)
  if (walkSource.width !== runSource.width || walkSource.height !== runSource.height) {
    throw new Error(`${profile.id} walk/run strips must share one source coordinate system.`)
  }

  const walk = splitFixedHorizontalPoses(walkSource, PLAYER_LOCOMOTION_FRAMES)
  const run = splitFixedHorizontalPoses(runSource, PLAYER_LOCOMOTION_FRAMES)
  if (walk.slotWidth !== run.slotWidth) {
    throw new Error(`${profile.id} walk/run slots must have equal widths.`)
  }

  const walkBounds = walk.poses.map(alphaBounds)
  const referenceHeight = Math.max(...walkBounds.map((bounds) => bounds.height))
  const scale = referenceHeight <= 1
    ? 1
    : (profile.targetHeight - 1) / (referenceHeight - 1)
  const sourceRootX = walk.slotWidth / 2
  for (const [kind, authoredPoses] of [
    ['walk', walk.poses],
    ['run', run.poses],
  ]) {
    const authoredBounds = authoredPoses.map(alphaBounds)
    const sourceBaselineY = Math.max(
      ...authoredBounds.map((bounds) => bounds.y + bounds.height - 1),
    )
    authoredPoses.forEach((pose, index) => {
      poses.set(
        locomotionPoseKey(kind, index),
        normalizePoseAtRoot(pose, scale, cell, sourceRootX, sourceBaselineY),
      )
    })
  }
}

const loadProfilePoses = async (profile) => {
  const source = await loadKeyedSource(profile.source)
  let rowImage
  let columnBounds
  if (profile.row === null) {
    rowImage = source
    columnBounds = adaptiveBoundaries(rowImage, 'x', 8, 180, 400)
  } else {
    let rows = matrixRowCache.get(profile.source)
    if (!rows) {
      const rowBounds = adaptiveBoundaries(source, 'y', 9, 70, 145)
      rows = Array.from({ length: 9 }, (_, row) =>
        crop(source, 0, rowBounds[row], source.width, rowBounds[row + 1] - rowBounds[row]),
      )
      matrixRowCache.set(profile.source, rows)
    }
    rowImage = rows[profile.row]
    columnBounds = adaptiveBoundaries(rowImage, 'x', 8, 130, 300)
  }
  const authoredPoses = Array.from({ length: 8 }, (_, column) => {
    const pose = crop(
      rowImage,
      columnBounds[column],
      0,
      columnBounds[column + 1] - columnBounds[column],
      rowImage.height,
    )
    return retainActorComponents(pose, profile.sheet === 'players' && column === 6)
  })
  const idleHeight = alphaBounds(authoredPoses[0]).height
  const scale = profile.targetHeight / idleHeight
  const cell = sheetSpecs[profile.sheet].cell
  const poses = new Map(authoredPoses.map((pose, index) => [
    basePoseKey(index),
    normalizePose(pose, scale, cell),
  ]))
  await loadPlayerLocomotionPoses(profile, poses, cell)
  await loadPlayerAttackPoses(profile, poses, cell)
  return poses
}

const packSheet = (sheetId, entries) => {
  const spec = sheetSpecs[sheetId]
  const rows = Math.ceil(entries.length / spec.columns)
  const sheet = new PNG({ width: spec.cell.width * spec.columns, height: spec.cell.height * rows })
  const frames = []
  entries.forEach((entry, index) => {
    const x = (index % spec.columns) * spec.cell.width
    const y = Math.floor(index / spec.columns) * spec.cell.height
    PNG.bitblt(entry.pose, sheet, 0, 0, spec.cell.width, spec.cell.height, x, y)
    frames.push({
      filename: entry.frame,
      frame: { x, y, w: spec.cell.width, h: spec.cell.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: spec.cell.width, h: spec.cell.height },
      sourceSize: { w: spec.cell.width, h: spec.cell.height },
      pivot: { x: 0.5, y: 1 },
    })
  })
  return { sheet, frames }
}

const writeStableJson = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)

await mkdir(outputRoot, { recursive: true })
const sheetEntries = { players: [], enemies: [], boss: [] }
const manifestProfiles = []

for (const profile of profileSpecs) {
  const poses = await loadProfilePoses(profile)
  const clips = buildClips(profile)
  const cell = sheetSpecs[profile.sheet].cell
  const poseFor = (poseKey) => {
    const pose = poses.get(poseKey)
    if (!pose) throw new Error(`Missing ${profile.id} pose: ${poseKey}`)
    return pose
  }
  const usedPoseKeys = [...new Set(clips.flatMap((entry) => entry.poseKeys))]
  const visibleBounds = usedPoseKeys.reduce((result, poseKey) => {
    const extents = poseExtents(poseFor(poseKey), cell)
    return {
      left: Math.max(result.left, extents.left),
      right: Math.max(result.right, extents.right),
    }
  }, { left: 0, right: 0 })
  for (const entry of clips) {
    entry.frames.forEach((frame, index) => {
      const pose = poseFor(entry.poseKeys[index])
      sheetEntries[profile.sheet].push({
        frame,
        pose,
      })
    })
  }
  const { poseKeys: _ignored, ...firstClip } = clips[0]
  void firstClip
  manifestProfiles.push({
    id: profile.id,
    sheet: profile.sheet,
    cell: sheetSpecs[profile.sheet].cell,
    targetHeight: profile.targetHeight,
    anchor: { x: 0.5, y: 1 },
    visibleBounds,
    shadow: {
      width: profile.sheet === 'boss' ? 84 : profile.sheet === 'enemies' ? 50 : 42,
      height: profile.sheet === 'boss' ? 14 : 10,
    },
    clips: clips.map(({ poseKeys: _poseKeys, ...entry }) => entry),
  })
}

const textures = []
const summaries = []
for (const sheetId of ['players', 'enemies', 'boss']) {
  const spec = sheetSpecs[sheetId]
  const { sheet, frames } = packSheet(sheetId, sheetEntries[sheetId])
  const bytes = PNG.sync.write(sheet, { colorType: 6, inputColorType: 6 })
  await writeFile(join(outputRoot, spec.image), bytes)
  textures.push({
    image: spec.image,
    format: 'RGBA8888',
    size: { w: sheet.width, h: sheet.height },
    scale: 1,
    frames,
  })
  summaries.push(`${spec.image}:${createHash('sha256').update(bytes).digest('hex')}`)
}

await writeStableJson(join(outputRoot, 'actors.multiatlas.json'), {
  textures,
  meta: { app: 'PROXY ZERO deterministic sprite exporter', version: '1', format: 'RGBA8888', scale: '1' },
})
await writeStableJson(join(outputRoot, 'actors.anim.json'), {
  schemaVersion: 1,
  atlasKey: 'actors',
  fps: 10,
  profiles: manifestProfiles,
})

console.log(`Generated ${sheetEntries.players.length + sheetEntries.enemies.length + sheetEntries.boss.length} actor frames.`)
for (const summary of summaries) console.log(summary)
