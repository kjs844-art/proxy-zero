import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => {
  class Scene {
    readonly scene = { start: vi.fn() }

    constructor(_config: unknown) {}
  }

  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  }
})

import {
  BufferedCombatActionQueue,
  GameServices,
} from '../../src/app/GameServices'
import { characters, type CharacterDefinition } from '../../src/content/characters'
import type {
  CombatActor,
  CombatState,
} from '../../src/domain/combat/combatReducer'
import {
  createRunState,
  type RunCheckpoint,
  type RunState,
} from '../../src/domain/run/runReducer'
import { CombatScene } from '../../src/phaser/scenes/CombatScene'

const makeActor = (overrides: Partial<CombatActor>): CombatActor => ({
  id: 'actor',
  team: 'neutral',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  facing: 1,
  body: { halfWidth: 12, halfDepth: 12, height: 48 },
  hp: 100,
  maxHp: 100,
  meter: 0,
  damageScale: 1,
  attackSpeedScale: 1,
  moveSpeedScale: 1,
  moveSpeed: 150,
  jumpSpeed: 300,
  gravity: 900,
  mode: 'idle',
  activeAttack: null,
  hitstunRemainingMs: 0,
  knockdownRemainingMs: 0,
  wakeInvulnerabilityRemainingMs: 0,
  pendingKnockdown: false,
  reactionSource: null,
  ...overrides,
})

const combatState = (
  playerMode: CombatActor['mode'],
  enemyMode: CombatActor['mode'],
  enemyHp = 24,
): CombatState => {
  const player = makeActor({
    id: 'han',
    team: 'heroes',
    hp: playerMode === 'defeated' ? 0 : 100,
    mode: playerMode,
  })
  const enemy = makeActor({
    id: 'greybox-enemy',
    team: 'enemies',
    hp: enemyHp,
    maxHp: 24,
    mode: enemyMode,
  })
  return {
    elapsedMs: 0,
    hitstopRemainingMs: 0,
    playerId: 'han',
    actors: { han: player, 'greybox-enemy': enemy },
    combo: {
      hitCount: 0,
      lastHitAtMs: null,
      lastAttackerId: null,
      lastTargetId: null,
    },
    events: [],
  }
}

type SceneHarness = {
  state: CombatState
  runState: RunState
  character: CharacterDefinition
  checkpointStore: { load(): RunCheckpoint | null }
  zoneCheckpoint: RunCheckpoint | null
  stepDomain(): void
  tryContinue(): void
  scene: { start: ReturnType<typeof vi.fn> }
}

const currentCheckpoint = (): RunCheckpoint => ({
  schemaVersion: 1,
  characterId: 'han',
  zoneId: 'n9-depot',
  zoneStartWaveId: 'n9-depot-wave-1',
  inventory: { itemId: null, count: 0, available: false },
})

const createCombatHarness = (
  state: CombatState,
  runOverrides: Partial<RunState>,
) => {
  const completeCombat = vi.fn()
  const services = {
    consumeDebugClear: () => false,
    completeCombat,
  } as unknown as GameServices
  const scene = new CombatScene(services) as unknown as SceneHarness
  scene.state = state
  scene.runState = {
    ...createRunState({
      characterId: 'han',
      zoneId: 'n9-depot',
      waveId: 'n9-depot-wave-1',
      maxHp: 100,
      inventory: { itemId: null, count: 0, available: false },
    }),
    ...runOverrides,
  }
  scene.character = characters[0]
  scene.zoneCheckpoint = currentCheckpoint()
  return { scene, completeCombat }
}

describe('first playable scene flow', () => {
  it('follows Boot -> Title -> CharacterSelect -> Combat -> Results', () => {
    const services = new GameServices()

    expect(services.enterBootScene()).toBe('Boot')
    expect(services.enterScene('Title')).toBe('Title')
    expect(services.enterScene('CharacterSelect')).toBe('CharacterSelect')
    services.confirmCharacter('han', 125)
    expect(services.enterScene('Combat')).toBe('Combat')
    expect(services.enterScene('Results')).toBe('Results')
    expect(services.sceneHistory).toEqual([
      'Boot',
      'Title',
      'CharacterSelect',
      'Combat',
      'Results',
    ])
  })

  it('allows Boot lifecycle restart without changing the normal route contract', () => {
    const services = new GameServices()

    expect(services.enterBootScene()).toBe('Boot')
    expect(services.enterScene('Title')).toBe('Title')
    expect(services.enterBootScene()).toBe('Boot')
    expect(services.enterScene('Title')).toBe('Title')
    expect(services.sceneHistory).toEqual(['Boot', 'Title', 'Boot', 'Title'])
  })

  it('retains attack and jump edges until accepted without changing physical timestamps', () => {
    const queue = new BufferedCombatActionQueue()
    const firstAttack = queue.buffer.enqueue(
      { type: 'attack', limb: 'right-hand' },
      0,
    )

    expect(queue.nextAction(0)).toBe(firstAttack)
    expect(queue.accept(firstAttack)).toBe(firstAttack)

    const comboAttack = queue.buffer.enqueue(
      { type: 'attack', limb: 'left-hand' },
      50,
    )
    expect(queue.nextAction(50)).toBe(comboAttack)
    expect(queue.nextAction(165)).toBe(comboAttack)
    expect(queue.nextAction(165)).toMatchObject({
      sequence: comboAttack.sequence,
      enqueuedAtMs: 50,
      edge: { type: 'attack', limb: 'left-hand' },
    })
    expect(queue.accept(comboAttack)).toMatchObject({ enqueuedAtMs: 50 })

    const jump = queue.buffer.enqueue({ type: 'jump' }, 200)
    expect(queue.nextAction(200)).toBe(jump)
    expect(queue.nextAction(350)).toBe(jump)
    expect(queue.accept(jump)).toBe(jump)
    expect(queue.nextAction(350)).toBeUndefined()
  })

  it.each(['han', 'mina', 'jin'] as const)('makes %s immediately selectable', (characterId) => {
    const services = new GameServices()
    services.enterScene('Boot')
    services.enterScene('Title')
    services.enterScene('CharacterSelect')

    expect(services.selectCharacter(characterId)).toBe(characterId)
    expect(services.confirmCharacter(characterId, 400)).toBe(characterId)
  })

  it('records combat input readiness within 2 seconds of confirmation', () => {
    const services = new GameServices()
    services.enterScene('Boot')
    services.enterScene('Title')
    services.enterScene('CharacterSelect')
    services.confirmCharacter('mina', 750)
    services.enterScene('Combat')

    services.markCombatInputReady(2_749)

    expect(services.combatInputDelayMs).toBe(1_999)
    expect(services.combatInputReadyWithin(2_000)).toBe(true)
  })

  it('records the first valid enemy spawn within 4 seconds of simulated combat', () => {
    const services = new GameServices()
    services.enterScene('Boot')
    services.enterScene('Title')
    services.enterScene('CharacterSelect')
    services.confirmCharacter('jin', 0)
    services.enterScene('Combat')

    services.recordEnemySpawn('greybox-enemy', 3_999)

    expect(services.firstEnemySpawn).toEqual({ actorId: 'greybox-enemy', atMs: 3_999 })
    expect(services.enemySpawnedWithin(4_000)).toBe(true)
  })
})

describe('CombatScene run adapter', () => {
  it('keeps terminal Game Over when player and enemy are defeated in the same tick', () => {
    const { scene, completeCombat } = createCombatHarness(
      combatState('defeated', 'defeated', 0),
      { lives: 1, hp: 0 },
    )

    scene.stepDomain()

    expect(scene.runState).toMatchObject({
      lives: 0,
      status: 'game-over',
      continueAvailable: true,
    })
    expect(completeCombat).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalled()
  })

  it('uses the current-session checkpoint when stored identity is stale', () => {
    const { scene } = createCombatHarness(combatState('defeated', 'idle', 3), {
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueAvailable: true,
      currentWaveId: 'n9-depot-wave-3',
    })
    scene.checkpointStore = {
      load: () => ({
        schemaVersion: 1,
        characterId: 'mina',
        zoneId: 'service-train',
        zoneStartWaveId: 'service-train-wave-1',
        inventory: { itemId: 'emp', count: 1, available: true },
      }),
    }

    scene.tryContinue()

    expect(scene.runState).toMatchObject({
      characterId: 'han',
      zoneId: 'n9-depot',
      zoneStartWaveId: 'n9-depot-wave-1',
      currentWaveId: 'n9-depot-wave-1',
      lives: 2,
      continueUsed: true,
    })
    expect(scene.character.id).toBe('han')
    expect(scene.state.playerId).toBe('han')
    expect(scene.state.actors['greybox-enemy'].hp).toBe(24)
    expect(scene.state.combo.hitCount).toBe(0)
  })

  it('respawns controllably in the same wave without resetting the enemy', () => {
    const { scene } = createCombatHarness(combatState('defeated', 'idle', 7), {
      lives: 2,
      hp: 0,
      currentWaveId: 'n9-depot-wave-3',
    })

    scene.stepDomain()

    expect(scene.runState).toMatchObject({
      lives: 1,
      currentWaveId: 'n9-depot-wave-3',
      respawnInvulnerabilityRemainingMs: 1_200,
      status: 'playing',
    })
    expect(scene.state.actors['greybox-enemy']).toMatchObject({ hp: 7, mode: 'idle' })
    expect(scene.state.actors.han).toMatchObject({
      hp: 100,
      mode: 'idle',
      wakeInvulnerabilityRemainingMs: 1_200,
    })
  })
})
