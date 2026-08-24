import Phaser from 'phaser'

import {
  type CompletedRunRecord,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'

const retryCodes = new Set(['Enter', 'Space', 'KeyJ'])
const titleCodes = new Set(['Escape', 'KeyT'])

const rankColors: Readonly<Record<CompletedRunRecord['rank'], string>> = {
  S: '#fbbf24',
  A: '#67e8f9',
  B: '#a7f3d0',
  C: '#ffffff',
  D: '#fb7185',
}

const outcomeLabels: Readonly<Record<CompletedRunRecord['outcome'], string>> = {
  'mission-clear': 'MISSION CLEAR',
  'mission-failed': 'GAME OVER',
  'debug-clear': 'DEBUG CLEAR',
}

const outcomeColors: Readonly<Record<CompletedRunRecord['outcome'], string>> = {
  'mission-clear': '#67e8f9',
  'mission-failed': '#fb7185',
  'debug-clear': '#fbbf24',
}

const formatActiveTime = (activeTimeMs: number): string => {
  const totalMs = Number.isFinite(activeTimeMs) ? Math.max(0, Math.trunc(activeTimeMs)) : 0
  const minutes = Math.floor(totalMs / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1_000)
  const milliseconds = totalMs % 1_000
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}

const formatScore = (score: number): string => {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.trunc(score)) : 0
  return safeScore.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export class ResultsScene extends Phaser.Scene {
  private transitioning = false

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Results })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Results)
    this.transitioning = false
    const record = this.services.completedRun
    if (record === null) {
      throw new Error('ResultsScene requires a completed run record.')
    }

    this.cameras.main.setBackgroundColor('#050a12')

    this.add
      .text(320, 24, 'PROXY ZERO // AFTER ACTION', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#67e8f9',
      })
      .setOrigin(0.5)

    this.add
      .text(112, 88, outcomeLabels[record.outcome], {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: outcomeColors[record.outcome],
      })
      .setOrigin(0.5)

    this.add
      .text(112, 188, record.rank, {
        fontFamily: 'monospace',
        fontSize: '96px',
        fontStyle: 'bold',
        color: rankColors[record.rank],
      })
      .setOrigin(0.5)

    const rows: readonly (readonly [string, string])[] = [
      ['TIME', formatActiveTime(record.activeTimeMs)],
      ['SCORE', formatScore(record.score)],
      ['MAX COMBO', Math.max(0, Math.trunc(record.maxCombo)).toString()],
      ['HITS TAKEN', Math.max(0, Math.trunc(record.hitsTaken)).toString()],
      ['CONTINUE', record.continueUsed ? 'USED' : 'NO'],
    ]

    rows.forEach(([label, value], index) => {
      const y = 82 + index * 42
      this.add
        .text(244, y, label, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#94a3b8',
        })
        .setOrigin(0, 0.5)
      this.add
        .text(606, y, value, {
          fontFamily: 'monospace',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(1, 0.5)
    })

    this.add
      .text(320, 330, 'ENTER / J  RETRY    ESC / T  TITLE', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#fbbf24',
      })
      .setOrigin(0.5)

    this.input.keyboard?.on('keydown', this.onKeyDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const retries = retryCodes.has(event.code)
    const returnsToTitle = titleCodes.has(event.code)
    if ((!retries && !returnsToTitle) || event.repeat) return

    event.preventDefault()
    if (this.transitioning) return
    this.transitioning = true

    if (retries) {
      this.services.prepareImmediateRetry()
      this.scene.start(SCENE_KEYS.Combat)
      return
    }

    this.scene.start(SCENE_KEYS.Title)
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.onKeyDown)
  }
}
