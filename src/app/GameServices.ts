import type { CharacterId } from '../content/characters'

export const SCENE_KEYS = {
  Boot: 'Boot',
  Title: 'Title',
  CharacterSelect: 'CharacterSelect',
  Combat: 'Combat',
  Results: 'Results',
} as const

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS]

export const CHARACTER_CHOICES: readonly CharacterId[] = ['han', 'mina', 'jin']

export interface GameCapabilities {
  mobile: boolean
  localSaveAvailable: boolean
  webAudioAvailable: boolean
}

export interface EnemySpawnRecord {
  actorId: string
  atMs: number
}

export type CombatResult = 'enemy-defeated' | 'debug-clear'

type CapabilityHost = {
  navigator?: {
    maxTouchPoints?: number
    userAgent?: string
  }
  matchMedia?: (query: string) => { matches: boolean }
  localStorage?: unknown
  AudioContext?: unknown
  webkitAudioContext?: unknown
}

const finiteTime = (atMs: number): number =>
  Number.isFinite(atMs) ? Math.max(0, atMs) : 0

const permittedNextScenes: Readonly<Record<SceneKey, readonly SceneKey[]>> = {
  Boot: ['Title'],
  Title: ['CharacterSelect'],
  CharacterSelect: ['Combat'],
  Combat: ['Results'],
  Results: ['Title'],
}

/** Read-only capability probes: no permissions, audio playback, or storage writes. */
export const probeGameCapabilities = (source: unknown = globalThis): GameCapabilities => {
  const host = source as CapabilityHost
  const navigator = host.navigator
  const coarsePointer = (() => {
    try {
      return host.matchMedia?.('(pointer: coarse)').matches === true
    } catch {
      return false
    }
  })()
  const mobile =
    (navigator?.maxTouchPoints ?? 0) > 0 ||
    coarsePointer ||
    /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent ?? '')

  let localSaveAvailable = false
  try {
    const storage = host.localStorage
    localSaveAvailable =
      typeof storage === 'object' &&
      storage !== null &&
      'getItem' in storage &&
      typeof (storage as { getItem?: unknown }).getItem === 'function'
  } catch {
    localSaveAvailable = false
  }

  return {
    mobile,
    localSaveAvailable,
    webAudioAvailable:
      typeof host.AudioContext === 'function' || typeof host.webkitAudioContext === 'function',
  }
}

/** Per-game injected state shared by the five scenes. */
export class GameServices {
  private currentSceneValue: SceneKey | null = null
  private readonly sceneHistoryValue: SceneKey[] = []
  private selectedCharacterValue: CharacterId | null = null
  private confirmedAtMs: number | null = null
  private inputReadyAtMs: number | null = null
  private firstEnemySpawnValue: EnemySpawnRecord | null = null
  private debugClearPending = false

  capabilities: GameCapabilities = {
    mobile: false,
    localSaveAvailable: false,
    webAudioAvailable: false,
  }

  result: CombatResult | null = null

  get currentScene(): SceneKey | null {
    return this.currentSceneValue
  }

  get sceneHistory(): readonly SceneKey[] {
    return [...this.sceneHistoryValue]
  }

  get selectedCharacter(): CharacterId | null {
    return this.selectedCharacterValue
  }

  get firstEnemySpawn(): EnemySpawnRecord | null {
    return this.firstEnemySpawnValue ? { ...this.firstEnemySpawnValue } : null
  }

  get combatInputDelayMs(): number | null {
    if (this.confirmedAtMs === null || this.inputReadyAtMs === null) return null
    return this.inputReadyAtMs - this.confirmedAtMs
  }

  enterScene(nextScene: SceneKey): SceneKey {
    if (this.currentSceneValue === null) {
      if (nextScene !== SCENE_KEYS.Boot) {
        throw new Error(`The first scene must be ${SCENE_KEYS.Boot}.`)
      }
    } else if (!permittedNextScenes[this.currentSceneValue].includes(nextScene)) {
      throw new Error(`Invalid scene transition: ${this.currentSceneValue} -> ${nextScene}`)
    }

    this.currentSceneValue = nextScene
    this.sceneHistoryValue.push(nextScene)
    if (nextScene === SCENE_KEYS.CharacterSelect) {
      this.selectedCharacterValue = null
      this.confirmedAtMs = null
      this.inputReadyAtMs = null
      this.firstEnemySpawnValue = null
      this.result = null
    }
    return nextScene
  }

  recordCapabilities(capabilities: Readonly<GameCapabilities>): void {
    this.capabilities = { ...capabilities }
  }

  selectCharacter(characterId: CharacterId): CharacterId {
    if (!CHARACTER_CHOICES.includes(characterId)) {
      throw new Error(`Unknown character: ${characterId}`)
    }
    this.selectedCharacterValue = characterId
    return characterId
  }

  confirmCharacter(characterId: CharacterId, simulatedAtMs: number): CharacterId {
    this.selectCharacter(characterId)
    this.confirmedAtMs = finiteTime(simulatedAtMs)
    return characterId
  }

  markCombatInputReady(simulatedAtMs: number): void {
    if (this.confirmedAtMs === null) {
      throw new Error('Character confirmation is required before combat input is ready.')
    }
    this.inputReadyAtMs = finiteTime(simulatedAtMs)
  }

  combatInputReadyWithin(limitMs: number): boolean {
    const delayMs = this.combatInputDelayMs
    return delayMs !== null && delayMs >= 0 && delayMs <= limitMs
  }

  recordEnemySpawn(actorId: string, simulatedAtMs: number): void {
    if (this.firstEnemySpawnValue !== null) return
    this.firstEnemySpawnValue = { actorId, atMs: finiteTime(simulatedAtMs) }
  }

  enemySpawnedWithin(limitMs: number): boolean {
    return (
      this.firstEnemySpawnValue !== null &&
      this.firstEnemySpawnValue.atMs <= limitMs
    )
  }

  requestDebugClear(): void {
    this.debugClearPending = true
  }

  consumeDebugClear(): boolean {
    const requested = this.debugClearPending
    this.debugClearPending = false
    return requested
  }

  completeCombat(result: CombatResult): void {
    this.result = result
  }
}
