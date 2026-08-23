import type {
  EnemyAttackPattern,
  EnemyBaseBodyDefinition,
  EnemyVariantDefinition,
} from '../domain/enemies/types'

const freeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) freeze(entry)
    Object.freeze(value)
  }
  return value
}

const attack = (
  id: string,
  telegraphMs: number,
  activeMs: number,
  recoveryMs: number,
  x: number,
  y: number,
  weight: number,
): EnemyAttackPattern => ({
  id,
  telegraphMs,
  activeMs,
  recoveryMs,
  range: { x, y },
  weight,
})

/** Exactly two normal-enemy body rigs; variants only change authored data. */
export const enemyBaseBodies: readonly EnemyBaseBodyDefinition[] = freeze([
  { id: 'scout-frame', maxHp: 42, radius: 18 },
  { id: 'bulwark-frame', maxHp: 76, radius: 26 },
])

export const enemyVariants: readonly EnemyVariantDefinition[] = freeze([
  {
    id: 'scout-striker',
    baseBodyId: 'scout-frame',
    moveSpeed: 148,
    chaseDistance: 180,
    guardDurationMs: 0,
    intentWeights: { attack: 1, guard: 0 },
    attacks: [
      attack('scout-striker-jab', 260, 90, 180, 64, 24, 3),
      attack('scout-striker-sweep', 320, 110, 220, 78, 30, 1),
    ],
  },
  {
    id: 'scout-patrol',
    baseBodyId: 'scout-frame',
    moveSpeed: 168,
    chaseDistance: 200,
    guardDurationMs: 0,
    intentWeights: { attack: 1, guard: 0 },
    attacks: [attack('scout-patrol-kick', 300, 100, 210, 70, 26, 1)],
  },
  {
    id: 'bulwark-sentinel',
    baseBodyId: 'bulwark-frame',
    moveSpeed: 92,
    chaseDistance: 170,
    guardDurationMs: 420,
    intentWeights: { attack: 3, guard: 2 },
    attacks: [attack('bulwark-sentinel-slam', 460, 140, 340, 72, 34, 1)],
  },
  {
    id: 'bulwark-enforcer',
    baseBodyId: 'bulwark-frame',
    moveSpeed: 106,
    chaseDistance: 190,
    guardDurationMs: 300,
    intentWeights: { attack: 4, guard: 1 },
    attacks: [
      attack('bulwark-enforcer-punch', 360, 120, 260, 68, 28, 2),
      attack('bulwark-enforcer-charge', 520, 160, 400, 112, 34, 1),
    ],
  },
])

const cloneAttack = (definition: Readonly<EnemyAttackPattern>): EnemyAttackPattern => ({
  ...definition,
  range: { ...definition.range },
})

const cloneBaseBody = (
  definition: Readonly<EnemyBaseBodyDefinition>,
): EnemyBaseBodyDefinition => ({ ...definition })

export const getEnemyBaseBody = (id: string): EnemyBaseBodyDefinition => {
  const definition = enemyBaseBodies.find((entry) => entry.id === id)
  if (!definition) throw new Error(`Unknown enemy base body: ${id}`)
  return cloneBaseBody(definition)
}

/** Returns a fresh data copy so one gameplay run cannot taint shared authored content. */
export const getEnemyVariant = (id: string): EnemyVariantDefinition => {
  const definition = enemyVariants.find((entry) => entry.id === id)
  if (!definition) throw new Error(`Unknown enemy variant: ${id}`)

  return {
    ...definition,
    intentWeights: { ...definition.intentWeights },
    attacks: definition.attacks.map(cloneAttack),
  }
}
