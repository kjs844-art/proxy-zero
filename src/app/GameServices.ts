import type { CharacterId } from '../content/characters'
import {
  type BufferedAction,
  InputBuffer,
} from '../domain/combat/inputBuffer'
import type { RunOutcome, RunRank } from '../domain/run/rankCalculator'

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

export interface CompletedRunRecord {
  readonly outcome: RunOutcome
  readonly characterId: CharacterId
  readonly activeTimeMs: number
  readonly score: number
  readonly maxCombo: number
  readonly hitsTaken: number
  readonly continueUsed: boolean
  readonly rank: RunRank
}

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

/**
 * Holds one physical combat edge until the pure reducer confirms acceptance.
 * Later edges remain FIFO-buffered and every retained edge keeps its original
 * sequence and domain timestamp.
 */
export class BufferedCombatActionQueue {
  private pendingAction: BufferedAction | undefined

  constructor(readonly buffer = new InputBuffer()) {}

  nextAction(domainTimeMs: number): BufferedAction | undefined {
    const atMs = finiteTime(domainTimeMs)
    if (this.pendingAction && atMs > this.pendingAction.expiresAtMs) {
      this.pendingAction = undefined
    }
    this.buffer.expire(atMs)
    this.pendingAction ??= this.buffer.consume(
      atMs,
      (entry) => entry.edge.type === 'attack' || entry.edge.type === 'jump',
    )
    return this.pendingAction
  }

  accept(action: Readonly<BufferedAction>): BufferedAction | undefined {
    if (this.pendingAction?.sequence === action.sequence) {
      const acceptedAction = this.pendingAction
      this.pendingAction = undefined
      return acceptedAction
    }
    return undefined
  }

  clear(): void {
    this.pendingAction = undefined
    this.buffer.clear()
  }
}

const permittedNextScenes: Readonly<Record<SceneKey, readonly SceneKey[]>> = {
  Boot: ['Title'],
  Title: ['CharacterSelect'],
  CharacterSelect: ['Combat'],
  Combat: ['Results'],
  Results: ['Combat', 'Title'],
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
  private completedRunValue: Readonly<CompletedRunRecord> | null = null
  private immediateRetryPrepared = false

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

  get completedRun(): CompletedRunRecord | null {
    return this.completedRunValue ? Object.freeze({ ...this.completedRunValue }) : null
  }

  get firstEnemySpawn(): EnemySpawnRecord | null {
    return this.firstEnemySpawnValue ? { ...this.firstEnemySpawnValue } : null
  }

  get combatInputDelayMs(): number | null {
    if (this.confirmedAtMs === null || this.inputReadyAtMs === null) return null
    return this.inputReadyAtMs - this.confirmedAtMs
  }

  enterScene(nextScene: SceneKey): SceneKey {
    const isImmediateRetry =
      this.currentSceneValue === SCENE_KEYS.Results && nextScene === SCENE_KEYS.Combat
    if (isImmediateRetry && !this.immediateRetryPrepared) {
      throw new Error(
        'Results -> Combat requires prepareImmediateRetry() before the scene transition.',
      )
    }

    if (this.currentSceneValue === null) {
      if (nextScene !== SCENE_KEYS.Boot) {
        throw new Error(`The first scene must be ${SCENE_KEYS.Boot}.`)
      }
    } else if (!permittedNextScenes[this.currentSceneValue].includes(nextScene)) {
      throw new Error(`Invalid scene transition: ${this.currentSceneValue} -> ${nextScene}`)
    }

    this.currentSceneValue = nextScene
    this.sceneHistoryValue.push(nextScene)
    if (isImmediateRetry) this.immediateRetryPrepared = false
    if (nextScene === SCENE_KEYS.CharacterSelect) {
      this.selectedCharacterValue = null
      this.confirmedAtMs = null
      this.inputReadyAtMs = null
      this.firstEnemySpawnValue = null
      this.result = null
      this.completedRunValue = null
      this.immediateRetryPrepared = false
    } else if (nextScene === SCENE_KEYS.Title) {
      this.immediateRetryPrepared = false
    }
    return nextScene
  }

  /** Phaser lifecycle restart hook; normal scene-route transitions stay strict. */
  enterBootScene(): SceneKey {
    if (this.currentSceneValue === null) return this.enterScene(SCENE_KEYS.Boot)
    this.currentSceneValue = SCENE_KEYS.Boot
    this.immediateRetryPrepared = false
    this.sceneHistoryValue.push(SCENE_KEYS.Boot)
    return SCENE_KEYS.Boot
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

  completeRun(record: Readonly<CompletedRunRecord>): boolean {
    if (this.completedRunValue !== null) return false
    this.completedRunValue = Object.freeze({ ...record })
    return true
  }

  prepareImmediateRetry(): CharacterId {
    if (this.currentSceneValue !== SCENE_KEYS.Results) {
      throw new Error('Immediate retry can only be prepared from Results.')
    }
    if (this.selectedCharacterValue === null) {
      throw new Error('Immediate retry requires a selected character.')
    }
    if (this.completedRunValue === null) {
      throw new Error('Immediate retry requires a completed run.')
    }

    const characterId = this.selectedCharacterValue
    this.completedRunValue = null
    this.result = null
    this.immediateRetryPrepared = true
    return characterId
  }

  completeCombat(result: CombatResult): void {
    this.result = result
  }
}
