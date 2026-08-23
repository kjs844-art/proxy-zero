import { describe, expect, it } from 'vitest'

import {
  BufferedCombatActionQueue,
  GameServices,
} from '../../src/app/GameServices'

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
