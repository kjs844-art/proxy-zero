import { describe, expect, it } from 'vitest'

import {
  STAGE1_ITEM_DROP_TABLE,
  createStageOneEnemyDropPickup,
} from '../../src/content/stage1ItemDrops'
import {
  floodedTunnelZone,
  n9DepotZone,
  serviceTrainZone,
} from '../../src/content/stage1'
import { getEnemyBaseBody, getEnemyVariant } from '../../src/content/enemies'
import { createZoneWaveRuntime } from '../../src/domain/waves/waveDirector'

describe('Stage 1 guaranteed item drops', () => {
  it('keys every drop with an exact authored wave-director runtime enemy ID', () => {
    const dropEnemyIds = Object.keys(STAGE1_ITEM_DROP_TABLE)
    const runtimeEnemyIds = new Set(
      [n9DepotZone, serviceTrainZone, floodedTunnelZone].flatMap((zone) =>
        zone.waves
          .filter((wave) => dropEnemyIds.some((enemyId) => enemyId.startsWith(`${wave.id}:`)))
          .flatMap((wave) => Object.keys(createZoneWaveRuntime(wave, wave.seed, {
            getBaseBody: getEnemyBaseBody,
            getVariant: getEnemyVariant,
          }).enemiesById)),
      ),
    )

    expect(dropEnemyIds.every((enemyId) => runtimeEnemyIds.has(enemyId)))
      .toBe(true)
    expect(STAGE1_ITEM_DROP_TABLE).toMatchObject({
      'n9-depot-wave-1:entry-patrol': 'repair-kit',
      'n9-depot-wave-2:anchor-sentinel': 'emp',
      'service-train-wave-1:train-striker': 'repair-kit',
      'flooded-tunnel-wave-1:tunnel-sentinel': 'emp',
    })
  })

  it('creates a fresh stable pickup at the defeat position and ignores unlisted enemies', () => {
    const position = { x: 248, y: 219, z: 7 }
    const pickup = createStageOneEnemyDropPickup(
      'n9-depot-wave-1:entry-patrol',
      position,
    )
    position.x = 999

    expect(pickup).toEqual({
      id: 'stage1-drop:n9-depot-wave-1:entry-patrol',
      itemId: 'repair-kit',
      position: { x: 248, y: 219 },
      consumed: false,
    })
    expect(createStageOneEnemyDropPickup('n9-depot-wave-1:not-authored', position)).toBeNull()
  })
})
