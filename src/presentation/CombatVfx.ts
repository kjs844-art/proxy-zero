import type Phaser from 'phaser'

import type { CombatEvent } from '../domain/combat/combatReducer'
import type { ItemEffect } from '../domain/items/itemReducer'
import type { AudioCueId } from './AudioBus'
import { resolveAttackLimbCueProfile } from './AttackLimbCueProfile'

export interface ActorPresentationPoint {
  readonly x: number
  readonly y: number
  readonly facing: -1 | 1
}

export type HazardWarningId = 'train-gap' | 'electric-puddle' | 'tunnel-train'

interface TimedEffect {
  readonly durationMs: number
  readonly seed: number
}

export type PresentationEffect =
  | (TimedEffect & { readonly type: 'burst'; readonly point: ActorPresentationPoint; readonly particleCount: number; readonly color: number; readonly strength: number })
  | (TimedEffect & { readonly type: 'trail'; readonly from: ActorPresentationPoint; readonly to: ActorPresentationPoint; readonly color: number; readonly strength: number })
  | (TimedEffect & { readonly type: 'afterimage'; readonly point: ActorPresentationPoint; readonly color: number; readonly strength: number })
  | (TimedEffect & { readonly type: 'floating-text'; readonly point: ActorPresentationPoint; readonly text: string; readonly color: number })
  | (TimedEffect & { readonly type: 'actor-flash'; readonly point: ActorPresentationPoint; readonly color: number; readonly radius: number })
  | (TimedEffect & { readonly type: 'ring'; readonly point: ActorPresentationPoint; readonly color: number; readonly radius: number })
  | (TimedEffect & { readonly type: 'warning'; readonly point: ActorPresentationPoint; readonly color: number; readonly warningId: HazardWarningId })
  | (TimedEffect & { readonly type: 'screen-flash'; readonly color: number; readonly alpha: number })
  | (TimedEffect & { readonly type: 'shake'; readonly strength: number; readonly amplitude: number })

export interface PresentationBatchPlan {
  readonly effects: readonly PresentationEffect[]
  readonly cues: readonly AudioCueId[]
  readonly confirmedHitCount: number
}

export interface PresentationBatchInput {
  readonly events: readonly Readonly<CombatEvent>[]
  readonly itemEffects: readonly Readonly<ItemEffect>[]
  readonly warningIds: readonly HazardWarningId[]
  readonly points: Readonly<Record<string, ActorPresentationPoint>>
  readonly lowEffect: boolean
  readonly playerId?: string
  readonly worldOffsetX?: number
}

const color = Object.freeze({
  cyan: 0x67e8f9,
  white: 0xe8fbff,
  hot: 0xffffff,
  hp: 0x36e5c7,
  meter: 0xf6c76e,
  warning: 0xff6b35,
})

const fallbackPoint: ActorPresentationPoint = Object.freeze({ x: 320, y: 220, facing: 1 })
const strengthIndex = (strength: number): 1 | 2 | 3 => strength >= 3 ? 3 : strength >= 2 ? 2 : 1
const cueFor = (prefix: 'attack' | 'hit', strength: number): AudioCueId =>
  `${prefix}-${strengthIndex(strength) === 3 ? 'finisher' : strengthIndex(strength) === 2 ? 'heavy' : 'light'}` as AudioCueId
const particlesFor = (strength: number, lowEffect: boolean): number =>
  (lowEffect ? [3, 5, 6] : [6, 8, 12])[strengthIndex(strength) - 1]
const durationFor = (strength: number): number =>
  [90, 130, 170][strengthIndex(strength) - 1]

const MAX_ACTIVE_EFFECTS = 32
const MAX_BURST_PARTICLES = 24
const MAX_TRAILS = 6
const MAX_AFTERIMAGES = 3

const hashText = (value: string): number => {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

const hitPoint = (
  attacker: Readonly<ActorPresentationPoint> | undefined,
  target: Readonly<ActorPresentationPoint> | undefined,
): ActorPresentationPoint => {
  const base = target ?? attacker ?? fallbackPoint
  const pull = attacker ? Math.sign(attacker.x - base.x) * 14 : 0
  return { x: base.x + pull, y: base.y - 10, facing: base.facing }
}

/** Pure event-to-presentation mapping; safe to exercise without Phaser. */
export const planPresentationBatch = (
  input: Readonly<PresentationBatchInput>,
): PresentationBatchPlan => {
  const effects: PresentationEffect[] = []
  const cues: AudioCueId[] = []
  let floatingTextCount = 0
  let confirmedHitCount = 0
  let strongestShake = 0
  let screenFlashAdded = false
  let eventIndex = 0

  const addBurst = (point: ActorPresentationPoint, strength: number, eventKey: string, tint: number = color.white) => {
    const normalized = strengthIndex(strength)
    effects.push({
      type: 'burst',
      point,
      particleCount: particlesFor(normalized, input.lowEffect),
      color: tint,
      strength: normalized,
      durationMs: durationFor(normalized),
      seed: hashText(`${eventKey}:${eventIndex}`),
    })
    strongestShake = Math.max(strongestShake, normalized)
  }
  const addText = (point: ActorPresentationPoint, text: string, tint: number) => {
    if (floatingTextCount >= 3) return
    floatingTextCount += 1
    effects.push({ type: 'floating-text', point, text, color: tint, durationMs: 520, seed: eventIndex })
  }

  for (const event of input.events) {
    eventIndex += 1
    if (event.type === 'attack-started') {
      const point = input.points[event.actorId] ?? fallbackPoint
      const strength = strengthIndex(event.strength)
      const limbCue = resolveAttackLimbCueProfile(event.attackId)
      cues.push(cueFor('attack', strength))
      if (limbCue.kind !== 'unknown') {
        const foot = limbCue.kind === 'foot'
        const verticalDirection = limbCue.side === 'left' ? -1 : 1
        const from = {
          ...point,
          y: point.y + (foot ? 17 : -7),
        }
        effects.push({
          type: 'trail',
          from,
          to: {
            x: point.x + point.facing * limbCue.arc.direction * limbCue.arc.radius,
            y: from.y + verticalDirection * (foot ? 15 : 9),
            facing: point.facing,
          },
          color: limbCue.color,
          strength,
          durationMs: foot ? 125 : 92,
          seed: hashText(event.attackId),
        })
        if (foot) {
          effects.push({
            type: 'burst',
            point: {
              x: point.x - point.facing * limbCue.dust.direction * 10,
              y: point.y + 24,
              facing: point.facing,
            },
            particleCount: input.lowEffect
              ? 2
              : limbCue.dust.particleCount,
            color: limbCue.color,
            strength: 1,
            durationMs: 105,
            seed: hashText(`${event.attackId}:dust`),
          })
        }
      } else if (strength >= 2) {
        effects.push({
          type: 'trail',
          from: point,
          to: { x: point.x + point.facing * (34 + strength * 8), y: point.y - 8, facing: point.facing },
          color: strength === 3 ? color.meter : color.cyan,
          strength,
          durationMs: strength === 3 ? 150 : 105,
          seed: hashText(event.attackId),
        })
      }
      if (strength >= 2 && !input.lowEffect) {
        effects.push({
          type: 'afterimage',
          point,
          color: strength === 3 ? color.meter : color.cyan,
          strength,
          durationMs: strength === 3 ? 145 : 110,
          seed: hashText(`${event.attackId}:afterimage`),
        })
      }
      continue
    }
    if (event.type === 'hit-confirmed') {
      const attacker = input.points[event.attackerId]
      const target = input.points[event.targetId]
      const point = hitPoint(attacker, target)
      const strength = strengthIndex(event.strength)
      if (!input.playerId || event.attackerId === input.playerId) confirmedHitCount += 1
      addBurst(point, strength, `${event.attackerId}:${event.targetId}:${event.attackId}`,
        strength === 3 ? color.meter : color.white)
      effects.push({ type: 'actor-flash', point: target ?? point, color: color.hot, radius: 14 + strength * 6,
        durationMs: 34 + strength * 18, seed: eventIndex })
      if (strength >= 2) {
        effects.push({
          type: 'ring',
          point,
          color: strength === 3 ? color.meter : color.cyan,
          radius: strength === 3 ? 32 : 22,
          durationMs: strength === 3 ? 125 : 90,
          seed: hashText(`${event.attackId}:impact-ring`),
        })
      }
      if (strength >= 2 && attacker) {
        effects.push({ type: 'trail', from: attacker, to: point, color: strength === 3 ? color.meter : color.cyan,
          strength, durationMs: strength === 3 ? 150 : 105, seed: eventIndex })
      }
      if (strength === 3 && !screenFlashAdded) {
        effects.push({
          type: 'screen-flash',
          color: color.hot,
          alpha: input.lowEffect ? 0.06 : 0.14,
          durationMs: 55,
          seed: eventIndex,
        })
        screenFlashAdded = true
      }
      addText(point, `${Math.ceil(event.damage)}`, strength === 3 ? color.meter : color.white)
      cues.push(cueFor('hit', strength))
      continue
    }
    if (event.type === 'actor-knocked-down') {
      const point = input.points[event.actorId] ?? fallbackPoint
      addBurst({ ...point, y: point.y + 22 }, 2, `down:${event.actorId}`, 0x87a5b5)
      cues.push('knockdown')
      continue
    }
    if (event.type === 'actor-defeated') {
      const point = input.points[event.actorId] ?? fallbackPoint
      addBurst(point, 3, `defeat:${event.actorId}`, color.warning)
      cues.push('defeat')
      continue
    }
    if (event.type === 'actor-healed') {
      const point = input.points[event.actorId] ?? fallbackPoint
      addText(point, `+${Math.ceil(event.amount)}`, color.hp)
      effects.push({ type: 'ring', point, color: color.hp, radius: 28, durationMs: 260, seed: eventIndex })
      continue
    }
    if (event.type === 'actor-interrupted') {
      const point = input.points[event.actorId] ?? fallbackPoint
      effects.push({ type: 'actor-flash', point, color: color.cyan, radius: 24, durationMs: 90, seed: eventIndex })
      continue
    }
    const point = input.points[event.actorId] ?? fallbackPoint
    addBurst(point, 2, `hazard:${event.actorId}`, color.warning)
    addText(point, `${Math.ceil(event.damage)}`, color.warning)
    cues.push('hazard-impact')
  }

  const playerPoint = input.playerId ? input.points[input.playerId] : undefined
  for (const effect of input.itemEffects) {
    if (effect.type === 'pickup-acquired') {
      effects.push({ type: 'ring', point: playerPoint ?? fallbackPoint, color: color.cyan, radius: 24, durationMs: 240, seed: hashText(effect.pickupId) })
      cues.push('pickup')
    } else if (effect.type === 'repair-requested') {
      effects.push({ type: 'ring', point: playerPoint ?? fallbackPoint, color: color.hp, radius: 34, durationMs: 320, seed: eventIndex })
      cues.push('repair')
    } else if (effect.type === 'emp-applied') {
      effects.push({ type: 'ring', point: playerPoint ?? fallbackPoint, color: color.cyan, radius: 78, durationMs: 360, seed: eventIndex })
      for (const target of effect.targets) {
        const point = input.points[target.targetId]
        if (point) effects.push({ type: 'actor-flash', point, color: color.cyan, radius: 26, durationMs: 100, seed: hashText(target.targetId) })
      }
      cues.push('emp')
    }
  }

  for (const warningId of input.warningIds) {
    const worldOffsetX = Number.isFinite(input.worldOffsetX) ? input.worldOffsetX ?? 0 : 0
    const point = warningId === 'electric-puddle'
      ? { x: 320 + worldOffsetX, y: 280, facing: 1 as const }
      : { x: 320 + worldOffsetX, y: 220, facing: 1 as const }
    effects.push({ type: 'warning', point, warningId, color: color.warning, durationMs: 500, seed: hashText(warningId) })
    cues.push('hazard-warning')
  }

  if (strongestShake > 0) {
    effects.push({
      type: 'shake',
      strength: strongestShake,
      amplitude: (strongestShake === 3 ? 4.2 : strongestShake === 2 ? 1.8 : 0) *
        (input.lowEffect ? 0.3 : 1),
      durationMs: strongestShake === 3 ? 105 : strongestShake === 2 ? 65 : 0,
      seed: eventIndex,
    })
  }

  return { effects, cues, confirmedHitCount }
}

export class CombatVfxBatchGate {
  private lastBatchId = -1

  accept(batchId: number): boolean {
    if (!Number.isSafeInteger(batchId) || batchId <= this.lastBatchId) return false
    this.lastBatchId = batchId
    return true
  }

  /** Transient resets intentionally preserve the scene-lifetime monotonic id. */
  resetTransient(): void {}
}

interface ActiveEffect {
  readonly effect: PresentationEffect
  elapsedMs: number
}

interface ActiveText {
  readonly object: Phaser.GameObjects.Text
  readonly effect: Extract<PresentationEffect, { type: 'floating-text' }>
  elapsedMs: number
}

/** Scene-owned renderer for pure presentation plans. */
export class CombatVfx {
  private readonly gate = new CombatVfxBatchGate()
  private readonly worldGraphics: Phaser.GameObjects.Graphics
  private readonly overlayGraphics: Phaser.GameObjects.Graphics
  private readonly activeEffects: ActiveEffect[] = []
  private readonly activeTexts: ActiveText[] = []
  private baseScrollX: number
  private baseScrollY: number
  private disposed = false

  constructor(private readonly scene: Phaser.Scene) {
    this.worldGraphics = scene.add.graphics().setDepth(9_000)
    this.overlayGraphics = scene.add.graphics().setDepth(9_001).setScrollFactor(0)
    this.baseScrollX = scene.cameras.main.scrollX || 0
    this.baseScrollY = scene.cameras.main.scrollY || 0
  }

  consume(batchId: number, plan: Readonly<PresentationBatchPlan>): boolean {
    if (this.disposed || !this.gate.accept(batchId)) return false
    for (const effect of plan.effects) {
      if (effect.durationMs <= 0) continue
      if (effect.type === 'floating-text') {
        while (this.activeTexts.length >= 3) {
          this.activeTexts.shift()?.object.destroy()
        }
        const object = this.scene.add.text(effect.point.x, effect.point.y, effect.text, {
          color: `#${effect.color.toString(16).padStart(6, '0')}`,
          fontFamily: 'monospace',
          fontSize: '12px',
          fontStyle: 'bold',
          stroke: '#050a12',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(9_002)
        this.activeTexts.push({ object, effect, elapsedMs: 0 })
      } else {
        if (effect.type === 'burst') {
          let activeParticles = this.activeEffects.reduce((total, active) =>
            total + (active.effect.type === 'burst' ? active.effect.particleCount : 0), 0)
          while (activeParticles + effect.particleCount > MAX_BURST_PARTICLES) {
            const oldestBurst = this.activeEffects.findIndex((active) => active.effect.type === 'burst')
            if (oldestBurst < 0) break
            const removed = this.activeEffects.splice(oldestBurst, 1)[0].effect
            if (removed.type === 'burst') activeParticles -= removed.particleCount
          }
        }
        if (effect.type === 'screen-flash') {
          for (let index = this.activeEffects.length - 1; index >= 0; index -= 1) {
            if (this.activeEffects[index].effect.type === 'screen-flash') this.activeEffects.splice(index, 1)
          }
        }
        if (effect.type === 'trail') {
          const trailIndexes = this.activeEffects.flatMap((active, index) =>
            active.effect.type === 'trail' ? [index] : [],
          )
          if (trailIndexes.length >= MAX_TRAILS) this.activeEffects.splice(trailIndexes[0], 1)
        }
        if (effect.type === 'afterimage') {
          const afterimageIndexes = this.activeEffects.flatMap((active, index) =>
            active.effect.type === 'afterimage' ? [index] : [],
          )
          if (afterimageIndexes.length >= MAX_AFTERIMAGES) {
            this.activeEffects.splice(afterimageIndexes[0], 1)
          }
        }
        if (effect.type === 'shake') {
          for (let index = this.activeEffects.length - 1; index >= 0; index -= 1) {
            if (this.activeEffects[index].effect.type === 'shake') this.activeEffects.splice(index, 1)
          }
        }
        while (this.activeEffects.length >= MAX_ACTIVE_EFFECTS) this.activeEffects.shift()
        this.activeEffects.push({ effect, elapsedMs: 0 })
      }
    }
    return true
  }

  /** Updates the authored camera position; transient shake remains additive. */
  setBaseCameraScroll(x: number, y = 0): void {
    if (Number.isFinite(x)) this.baseScrollX = x
    if (Number.isFinite(y)) this.baseScrollY = y
  }

  update(requestedDeltaMs: number): void {
    if (this.disposed) return
    const deltaMs = Number.isFinite(requestedDeltaMs) ? Math.max(0, requestedDeltaMs) : 0
    this.worldGraphics.clear()
    this.overlayGraphics.clear()
    let shakeX = 0
    let shakeY = 0
    let shakeAmplitude = 0

    for (let index = this.activeEffects.length - 1; index >= 0; index -= 1) {
      const active = this.activeEffects[index]
      active.elapsedMs += deltaMs
      if (active.elapsedMs >= active.effect.durationMs) {
        this.activeEffects.splice(index, 1)
        continue
      }
      const progress = active.elapsedMs / active.effect.durationMs
      const alpha = 1 - progress
      const effect = active.effect
      if (effect.type === 'burst') {
        const travel = 1 - ((1 - progress) ** 2)
        const distance = (11 + effect.strength * 8) * (0.3 + travel * 0.82)
        const rotation = (effect.seed % 17) * 0.03
        this.worldGraphics.lineStyle(3 + effect.strength, effect.color, alpha * 0.18)
        for (let ray = 0; ray < effect.particleCount; ray += 1) {
          const angle = ((ray / effect.particleCount) * Math.PI * 2) + rotation
          const rayDistance = distance * (ray % 3 === 0 ? 1.15 : ray % 2 === 0 ? 0.82 : 1)
          const inner = rayDistance * 0.28
          this.worldGraphics.lineBetween(
            effect.point.x + Math.cos(angle) * inner,
            effect.point.y + Math.sin(angle) * inner,
            effect.point.x + Math.cos(angle) * rayDistance,
            effect.point.y + Math.sin(angle) * rayDistance,
          )
        }
        this.worldGraphics.lineStyle(effect.strength === 3 ? 2.25 : 1.25, color.hot, alpha * 0.92)
        for (let ray = 0; ray < effect.particleCount; ray += 1) {
          const angle = ((ray / effect.particleCount) * Math.PI * 2) + rotation
          const rayDistance = distance * (ray % 3 === 0 ? 1.02 : 0.72)
          this.worldGraphics.lineBetween(
            effect.point.x + Math.cos(angle) * rayDistance * 0.24,
            effect.point.y + Math.sin(angle) * rayDistance * 0.24,
            effect.point.x + Math.cos(angle) * rayDistance,
            effect.point.y + Math.sin(angle) * rayDistance,
          )
        }
        if (effect.strength >= 2) {
          const slashAngle = (effect.seed % 29) * 0.07
          const slashRadius = (7 + effect.strength * 4) * (0.7 + progress * 0.45)
          this.worldGraphics.lineStyle(effect.strength === 3 ? 3 : 2, color.hot, alpha * 0.88)
          this.worldGraphics.lineBetween(
            effect.point.x - Math.cos(slashAngle) * slashRadius,
            effect.point.y - Math.sin(slashAngle) * slashRadius,
            effect.point.x + Math.cos(slashAngle) * slashRadius,
            effect.point.y + Math.sin(slashAngle) * slashRadius,
          )
          if (effect.strength === 3) {
            const crossAngle = slashAngle + Math.PI / 2
            this.worldGraphics.lineBetween(
              effect.point.x - Math.cos(crossAngle) * slashRadius * 0.72,
              effect.point.y - Math.sin(crossAngle) * slashRadius * 0.72,
              effect.point.x + Math.cos(crossAngle) * slashRadius * 0.72,
              effect.point.y + Math.sin(crossAngle) * slashRadius * 0.72,
            )
          }
        }
        this.worldGraphics.fillStyle(effect.color, alpha * 0.42)
        this.worldGraphics.fillCircle(
          effect.point.x,
          effect.point.y,
          Math.max(1, (7 + effect.strength * 1.5) * alpha),
        )
        this.worldGraphics.fillStyle(color.hot, alpha * 0.96)
        this.worldGraphics.fillCircle(effect.point.x, effect.point.y, Math.max(1, 4 * alpha))
      } else if (effect.type === 'trail') {
        const fromY = effect.from.y - 8
        this.worldGraphics.lineStyle(6 + effect.strength * 2, effect.color, alpha * 0.12)
        this.worldGraphics.lineBetween(effect.from.x, fromY, effect.to.x, effect.to.y)
        this.worldGraphics.lineStyle(2 + effect.strength * 0.7, effect.color, alpha * 0.74)
        this.worldGraphics.lineBetween(effect.from.x, fromY, effect.to.x, effect.to.y)
        this.worldGraphics.lineStyle(1, color.hot, alpha * 0.82)
        this.worldGraphics.lineBetween(
          effect.from.x + (effect.to.x - effect.from.x) * 0.42,
          fromY + (effect.to.y - fromY) * 0.42,
          effect.to.x,
          effect.to.y,
        )
      } else if (effect.type === 'afterimage') {
        const echoCount = effect.strength === 3 ? 2 : 1
        for (let echo = 0; echo < echoCount; echo += 1) {
          const echoScale = 1 - echo * 0.08
          const echoAlpha = (alpha ** 2) * (effect.strength === 3 ? 0.22 : 0.16) /
            (echo + 1)
          const x = effect.point.x - effect.point.facing * (
            7 + progress * 18 + echo * 8
          )
          const y = effect.point.y
          this.worldGraphics.fillStyle(effect.color, echoAlpha)
          this.worldGraphics.fillCircle(x, y, 5.5 * echoScale)
          this.worldGraphics.lineStyle(9 * echoScale, effect.color, echoAlpha)
          this.worldGraphics.lineBetween(x, y + 8 * echoScale, x, y + 25 * echoScale)
          this.worldGraphics.lineStyle(4.5 * echoScale, effect.color, echoAlpha)
          this.worldGraphics.lineBetween(
            x,
            y + 12 * echoScale,
            x + effect.point.facing * 15 * echoScale,
            y + 18 * echoScale,
          )
          this.worldGraphics.lineBetween(
            x,
            y + 14 * echoScale,
            x - effect.point.facing * 9 * echoScale,
            y + 21 * echoScale,
          )
          this.worldGraphics.lineBetween(
            x,
            y + 25 * echoScale,
            x + effect.point.facing * 8 * echoScale,
            y + 42 * echoScale,
          )
          this.worldGraphics.lineBetween(
            x,
            y + 25 * echoScale,
            x - effect.point.facing * 7 * echoScale,
            y + 43 * echoScale,
          )
        }
      } else if (effect.type === 'actor-flash') {
        this.worldGraphics.fillStyle(effect.color, alpha * 0.24)
        this.worldGraphics.fillCircle(effect.point.x, effect.point.y, effect.radius * (0.65 + progress * 0.35))
        this.worldGraphics.fillStyle(color.hot, alpha * 0.22)
        this.worldGraphics.fillCircle(
          effect.point.x,
          effect.point.y,
          effect.radius * (0.28 + progress * 0.12),
        )
      } else if (effect.type === 'ring' || effect.type === 'warning') {
        const radius = effect.type === 'ring' ? effect.radius : 34
        const expanded = radius * (0.45 + progress * 0.75)
        this.worldGraphics.lineStyle(effect.type === 'warning' ? 3 : 2, effect.color, alpha)
        for (let side = 0; side < 12; side += 1) {
          const first = (side / 12) * Math.PI * 2
          const second = ((side + 0.62) / 12) * Math.PI * 2
          this.worldGraphics.lineBetween(
            effect.point.x + Math.cos(first) * expanded,
            effect.point.y + Math.sin(first) * expanded * 0.42,
            effect.point.x + Math.cos(second) * expanded,
            effect.point.y + Math.sin(second) * expanded * 0.42,
          )
        }
      } else if (effect.type === 'screen-flash') {
        this.overlayGraphics.fillStyle(effect.color, effect.alpha * alpha)
        this.overlayGraphics.fillRect(0, 0, 640, 360)
      } else if (effect.type === 'shake') {
        const wave = (active.elapsedMs + effect.seed) * 0.19
        const currentAmplitude = effect.amplitude * alpha
        if (currentAmplitude >= shakeAmplitude) {
          shakeAmplitude = currentAmplitude
          shakeX = Math.sin(wave) * currentAmplitude
          shakeY = Math.cos(wave * 1.31) * currentAmplitude
        }
      }
    }

    for (let index = this.activeTexts.length - 1; index >= 0; index -= 1) {
      const active = this.activeTexts[index]
      active.elapsedMs += deltaMs
      if (active.elapsedMs >= active.effect.durationMs) {
        active.object.destroy()
        this.activeTexts.splice(index, 1)
        continue
      }
      const progress = active.elapsedMs / active.effect.durationMs
      active.object
        .setPosition(active.effect.point.x, active.effect.point.y - progress * 24)
        .setAlpha(1 - progress)
    }
    this.setCameraScroll(this.baseScrollX + shakeX, this.baseScrollY + shakeY)
  }

  resetTransient(): void {
    for (const active of this.activeTexts) active.object.destroy()
    this.activeTexts.length = 0
    this.activeEffects.length = 0
    this.worldGraphics.clear()
    this.overlayGraphics.clear()
    this.setCameraScroll(this.baseScrollX, this.baseScrollY)
    this.gate.resetTransient()
  }

  snapshot(): {
    readonly activeEffectCount: number
    readonly activeTextCount: number
    readonly activeBurstParticles: number
    readonly activeTrailCount: number
    readonly activeAfterimageCount: number
  } {
    return {
      activeEffectCount: this.activeEffects.length,
      activeTextCount: this.activeTexts.length,
      activeBurstParticles: this.activeEffects.reduce((total, active) =>
        total + (active.effect.type === 'burst' ? active.effect.particleCount : 0), 0),
      activeTrailCount: this.activeEffects.filter((active) =>
        active.effect.type === 'trail').length,
      activeAfterimageCount: this.activeEffects.filter((active) =>
        active.effect.type === 'afterimage').length,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.resetTransient()
    this.disposed = true
    this.worldGraphics.destroy()
    this.overlayGraphics.destroy()
  }

  private setCameraScroll(x: number, y: number): void {
    const camera = this.scene.cameras?.main as (Phaser.Cameras.Scene2D.Camera & {
      setScroll?: (x: number, y: number) => unknown
    }) | undefined
    camera?.setScroll?.(x, y)
  }
}
