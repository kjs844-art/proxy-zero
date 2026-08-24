import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PNG } from 'pngjs'

import { characters } from '../../src/content/characters'
import {
  ACTOR_ATLAS_KEY,
  ACTOR_PROFILE_IDS,
  actorAnimationManifest,
  getActorVisualProfile,
  resolveVisualAttackId,
} from '../../src/content/animations'

const normalEnemyAttacks: Readonly<Record<string, readonly string[]>> = {
  'scout-striker': ['scout-striker-jab', 'scout-striker-sweep'],
  'scout-patrol': ['scout-patrol-kick'],
  'bulwark-sentinel': ['bulwark-sentinel-slam'],
  'bulwark-enforcer': ['bulwark-enforcer-punch', 'bulwark-enforcer-charge'],
}

interface AtlasFrame {
  filename: string
  frame: { x: number; y: number; w: number; h: number }
  rotated: boolean
  trimmed: boolean
  pivot: { x: number; y: number }
}

interface AtlasTexture {
  image: string
  size: { w: number; h: number }
  frames: AtlasFrame[]
}

interface GeneratedAtlas {
  textures: AtlasTexture[]
}

interface GeneratedClip {
  id: string
  state: string
  frames: string[]
}

interface GeneratedProfile {
  id: string
  cell: { width: number; height: number }
  targetHeight: number
  anchor: { x: number; y: number }
  clips: GeneratedClip[]
}

interface GeneratedAnimations {
  schemaVersion: number
  atlasKey: string
  fps: number
  profiles: GeneratedProfile[]
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

const alphaBounds = (
  png: PNG,
  frame: Readonly<AtlasFrame>,
): { width: number; height: number; bottom: number; hash: string } => {
  let minX = frame.frame.w
  let minY = frame.frame.h
  let maxX = -1
  let maxY = -1
  const alpha = Buffer.alloc(frame.frame.w * frame.frame.h)
  for (let y = 0; y < frame.frame.h; y += 1) {
    for (let x = 0; x < frame.frame.w; x += 1) {
      const source = ((frame.frame.y + y) * png.width + frame.frame.x + x) * 4
      const value = png.data[source + 3]
      alpha[y * frame.frame.w + x] = value
      if (value <= 8) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    bottom: maxY,
    hash: sha256(alpha),
  }
}

describe('Task 13 actor animation manifest', () => {
  it('exports byte-identical bounded PNGs and complete cross-manifests twice', () => {
    const first = mkdtempSync(join(tmpdir(), 'proxy-zero-atlas-a-'))
    const second = mkdtempSync(join(tmpdir(), 'proxy-zero-atlas-b-'))
    const outputNames = [
      'actors_players.png',
      'actors_enemies.png',
      'actor_boss.png',
      'actors.multiatlas.json',
      'actors.anim.json',
    ]
    try {
      const script = join(process.cwd(), 'scripts', 'generate-sprite-atlas.mjs')
      execFileSync(process.execPath, [script, '--out-dir', first], { stdio: 'ignore' })
      execFileSync(process.execPath, [script, '--out-dir', second], { stdio: 'ignore' })
      for (const name of outputNames) {
        expect(sha256(readFileSync(join(first, name))), name).toBe(
          sha256(readFileSync(join(second, name))),
        )
      }

      const atlas = JSON.parse(
        readFileSync(join(first, 'actors.multiatlas.json'), 'utf8'),
      ) as GeneratedAtlas
      const animations = JSON.parse(
        readFileSync(join(first, 'actors.anim.json'), 'utf8'),
      ) as GeneratedAnimations
      expect(animations).toMatchObject({ schemaVersion: 1, atlasKey: 'actors', fps: 10 })
      expect(animations.profiles.map((profile) => profile.id)).toEqual(ACTOR_PROFILE_IDS)
      expect(atlas.textures.map((texture) => texture.image)).toEqual([
        'actors_players.png', 'actors_enemies.png', 'actor_boss.png',
      ])

      const atlasFrames = atlas.textures.flatMap((texture) => texture.frames)
      const referencedFrames = animations.profiles.flatMap((profile) =>
        profile.clips.flatMap((clip) => clip.frames),
      )
      expect(new Set(atlasFrames.map((frame) => frame.filename)).size).toBe(atlasFrames.length)
      expect(new Set(referencedFrames).size).toBe(referencedFrames.length)
      expect([...referencedFrames].sort()).toEqual(
        atlasFrames.map((frame) => frame.filename).sort(),
      )

      const texturesByImage = new Map(atlas.textures.map((texture) => [texture.image, texture]))
      const pngsByImage = new Map(atlas.textures.map((texture) => [
        texture.image,
        PNG.sync.read(readFileSync(join(first, texture.image))),
      ]))
      const frameByName = new Map(atlasFrames.map((frame) => [frame.filename, frame]))
      const sheetImageById = {
        players: 'actors_players.png', enemies: 'actors_enemies.png', boss: 'actor_boss.png',
      } as const

      for (const texture of atlas.textures) {
        const png = pngsByImage.get(texture.image)
        expect(png, texture.image).toBeDefined()
        expect({ w: png?.width, h: png?.height }).toEqual(texture.size)
        for (const frame of texture.frames) {
          expect(frame.rotated).toBe(false)
          expect(frame.trimmed).toBe(false)
          expect(frame.pivot).toEqual({ x: 0.5, y: 1 })
          expect(frame.frame.x + frame.frame.w).toBeLessThanOrEqual(texture.size.w)
          expect(frame.frame.y + frame.frame.h).toBeLessThanOrEqual(texture.size.h)
        }
      }

      const playerSilhouettes = new Set<string>()
      for (const profile of animations.profiles) {
        const runtime = getActorVisualProfile(profile.id)
        expect(profile.cell).toEqual(runtime.cell)
        expect(profile.targetHeight).toBe(runtime.targetHeight)
        expect(profile.anchor).toEqual(runtime.anchor)
        const idleName = profile.clips.find((clip) => clip.id === 'idle')?.frames[0]
        expect(idleName).toBeDefined()
        const frame = frameByName.get(idleName ?? '')
        const image = sheetImageById[runtime.sheet]
        const texture = texturesByImage.get(image)
        const png = pngsByImage.get(image)
        expect(frame).toBeDefined()
        expect(texture).toBeDefined()
        expect(png).toBeDefined()
        if (!frame || !png) continue
        expect(frame.frame).toMatchObject({ w: profile.cell.width, h: profile.cell.height })
        const bounds = alphaBounds(png, frame)
        expect(bounds.height, profile.id).toBe(profile.targetHeight)
        expect(bounds.bottom, profile.id).toBe(profile.cell.height - 1)
        if (profile.id === 'han' || profile.id === 'mina' || profile.id === 'jin') {
          playerSilhouettes.add(`${bounds.width}:${bounds.height}:${bounds.hash}`)
        }
      }
      expect(playerSilhouettes.size).toBe(3)
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  }, 30_000)

  it('owns exactly nine stable atlas profiles with fixed anchors and target heights', () => {
    expect(ACTOR_ATLAS_KEY).toBe('actors')
    expect(ACTOR_PROFILE_IDS).toHaveLength(9)
    expect(new Set(ACTOR_PROFILE_IDS).size).toBe(9)
    expect(actorAnimationManifest.profiles.map((profile) => profile.id)).toEqual(
      ACTOR_PROFILE_IDS,
    )
    expect(actorAnimationManifest.profiles.map((profile) => profile.targetHeight)).toEqual([
      120, 114, 124, 104, 100, 128, 124, 136, 172,
    ])
    for (const profile of actorAnimationManifest.profiles) {
      expect(profile.anchor).toEqual({ x: 0.5, y: 1 })
      expect(profile.clips.idle.frames.length).toBeGreaterThan(0)
    }
  })

  it('resolves all 24 player attacks and all ten authored enemy, elite, and boss attacks', () => {
    for (const character of characters) {
      const expected = [
        ...Object.values(character.normalAttackIds),
        ...character.techniqueRecipes.map((recipe) => recipe.attackId),
        character.jumpAttackId,
        character.superAttackId,
      ]
      expect(Object.keys(getActorVisualProfile(character.id).attacks).sort()).toEqual(
        expected.sort(),
      )
    }

    for (const [profileId, attackIds] of Object.entries(normalEnemyAttacks)) {
      for (const attackId of attackIds) {
        expect(getActorVisualProfile(profileId).attacks[attackId], attackId).toBeDefined()
      }
    }
    for (const attackId of ['elite-rail-hammer', 'elite-lane-charge']) {
      expect(getActorVisualProfile('elite-bulwark-frame').attacks[attackId]).toBeDefined()
    }
    for (const attackId of ['boss-dredger-slam', 'boss-floodline-charge']) {
      expect(getActorVisualProfile('boss-silo-dredger').attacks[attackId]).toBeDefined()
    }
  })

  it('reverse-maps reducer attack IDs for every normal enemy profile', () => {
    expect(resolveVisualAttackId('scout-striker', 'han-right-hand')).toBe(
      'scout-striker-jab',
    )
    expect(resolveVisualAttackId('scout-striker', 'han-left-foot')).toBe(
      'scout-striker-sweep',
    )
    expect(resolveVisualAttackId('scout-patrol', 'han-right-foot')).toBe(
      'scout-patrol-kick',
    )
    expect(resolveVisualAttackId('bulwark-sentinel', 'jin-anchor-blow')).toBe(
      'bulwark-sentinel-slam',
    )
    expect(resolveVisualAttackId('bulwark-enforcer', 'han-left-hand')).toBe(
      'bulwark-enforcer-punch',
    )
    expect(resolveVisualAttackId('bulwark-enforcer', 'han-rising-kick')).toBe(
      'bulwark-enforcer-charge',
    )
  })
})
