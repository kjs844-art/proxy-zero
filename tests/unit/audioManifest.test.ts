import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { AUDIO_CUE_IDS } from '../../src/presentation/AudioBus'

interface AudioManifest {
  schemaVersion: number
  cues: Array<{
    id: string
    path: string
    seed: number
    sampleRate: number
    channels: number
    duration: number
    bytes: number
    sha256: string
    source: string
  }>
}

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

describe('deterministic procedural audio assets', () => {
  it('generates exactly fourteen byte-identical PCM16 WAV cues with truthful hashes', () => {
    const first = mkdtempSync(join(tmpdir(), 'proxy-zero-audio-a-'))
    const second = mkdtempSync(join(tmpdir(), 'proxy-zero-audio-b-'))
    try {
      const script = join(process.cwd(), 'scripts', 'generate-audio.mjs')
      execFileSync(process.execPath, [script, '--out-dir', first], { stdio: 'ignore' })
      execFileSync(process.execPath, [script, '--out-dir', second], { stdio: 'ignore' })
      const manifest = JSON.parse(readFileSync(join(first, 'audio.manifest.json'), 'utf8')) as AudioManifest
      expect(readFileSync(join(first, 'audio.manifest.json'))).toEqual(
        readFileSync(join(process.cwd(), 'public', 'assets', 'audio', 'audio.manifest.json')),
      )
      expect(manifest.schemaVersion).toBe(1)
      expect(manifest.cues.map((cue) => cue.id)).toEqual(AUDIO_CUE_IDS)
      for (const cue of manifest.cues) {
        const left = readFileSync(join(first, cue.path))
        const right = readFileSync(join(second, cue.path))
        const shipped = readFileSync(join(process.cwd(), 'public', 'assets', 'audio', cue.path))
        expect(left.subarray(0, 4).toString('ascii')).toBe('RIFF')
        expect(left.subarray(8, 12).toString('ascii')).toBe('WAVE')
        expect(hash(left), cue.id).toBe(hash(right))
        expect(hash(left), cue.id).toBe(hash(shipped))
        expect(hash(left), cue.id).toBe(cue.sha256)
        expect(cue).toMatchObject({ sampleRate: 22_050, channels: 1, bytes: left.length, source: 'procedural-pcm16' })
      }
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })
})
