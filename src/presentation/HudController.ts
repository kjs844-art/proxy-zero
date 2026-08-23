import Phaser from 'phaser'

import type { CharacterId } from '../content/characters'
import type { CombatActor } from '../domain/combat/combatReducer'

const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#e8fbff',
  backgroundColor: '#071018cc',
  padding: { x: 6, y: 4 },
}

/** Presentation-only HUD. Domain state remains the sole source of combat truth. */
export class HudController {
  private readonly statusText: Phaser.GameObjects.Text
  private readonly controlsText: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, private readonly characterId: CharacterId) {
    this.statusText = scene.add.text(8, 8, '', hudStyle).setDepth(10_000).setScrollFactor(0)
    this.controlsText = scene.add
      .text(8, 336, 'WASD MOVE  SPACE JUMP  J/K/L/; ATTACK', hudStyle)
      .setOrigin(0, 1)
      .setDepth(10_000)
      .setScrollFactor(0)
  }

  update(player: Readonly<CombatActor>): void {
    this.statusText.setText(
      `${this.characterId.toUpperCase()}  HP ${Math.ceil(player.hp)}/${player.maxHp}  METER ${Math.floor(player.meter)}`,
    )
  }

  dispose(): void {
    this.statusText.destroy()
    this.controlsText.destroy()
  }
}
