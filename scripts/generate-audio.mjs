import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SAMPLE_RATE = 22_050
const CHANNELS = 1
const SOURCE = 'procedural-pcm16'

const cueSpecs = [
  ['attack-light', 0x2011, 0.12, 'swipe', 430],
  ['attack-heavy', 0x2012, 0.17, 'swipe', 270],
  ['attack-finisher', 0x2013, 0.24, 'swipe', 165],
  ['hit-light', 0x2021, 0.10, 'impact', 520],
  ['hit-heavy', 0x2022, 0.16, 'impact', 310],
  ['hit-finisher', 0x2023, 0.24, 'impact', 185],
  ['knockdown', 0x2031, 0.28, 'impact', 120],
  ['defeat', 0x2032, 0.48, 'defeat', 155],
  ['pickup', 0x2041, 0.24, 'chime', 660],
  ['repair', 0x2042, 0.42, 'repair', 440],
  ['emp', 0x2043, 0.46, 'emp', 96],
  ['hazard-warning', 0x2051, 0.52, 'warning', 410],
  ['hazard-impact', 0x2052, 0.30, 'impact', 92],
  ['combat-loop', 0x2061, 4.00, 'loop', 110],
]

const argument = process.argv.indexOf('--out-dir')
const outputDir = resolve(argument >= 0 ? process.argv[argument + 1] : 'public/assets/audio')
mkdirSync(outputDir, { recursive: true })

const clamp = (value) => Math.max(-1, Math.min(1, value))
const envelope = (t, duration, attack = 0.008, release = 0.12) =>
  Math.min(1, t / attack) * Math.min(1, Math.max(0, duration - t) / release)

const rngFor = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

const synth = (seed, duration, kind, baseFrequency) => {
  const frameCount = Math.round(duration * SAMPLE_RATE)
  const samples = new Int16Array(frameCount)
  const random = rngFor(seed)
  let filteredNoise = 0
  for (let index = 0; index < frameCount; index += 1) {
    const t = index / SAMPLE_RATE
    const progress = t / duration
    const noise = random() * 2 - 1
    filteredNoise = filteredNoise * 0.72 + noise * 0.28
    let sample = 0
    if (kind === 'swipe') {
      const frequency = baseFrequency * (1.9 - progress * 1.45)
      sample = Math.sin(Math.PI * 2 * frequency * t) * 0.24 + filteredNoise * 0.55
      sample *= envelope(t, duration, 0.006, duration * 0.65) * (1 - progress * 0.55)
    } else if (kind === 'impact') {
      const thump = Math.sin(Math.PI * 2 * baseFrequency * t) * Math.exp(-t * 18)
      sample = thump * 0.68 + filteredNoise * Math.exp(-t * 28) * 0.58
    } else if (kind === 'defeat') {
      const pitch = baseFrequency * (1 - progress * 0.58)
      sample = (Math.sin(Math.PI * 2 * pitch * t) * 0.56 + filteredNoise * 0.18) *
        envelope(t, duration, 0.012, 0.32)
    } else if (kind === 'chime') {
      sample = (
        Math.sin(Math.PI * 2 * baseFrequency * t) * 0.48 +
        Math.sin(Math.PI * 2 * baseFrequency * 1.5 * t) * 0.25
      ) * envelope(t, duration, 0.008, 0.18)
    } else if (kind === 'repair') {
      const stepped = baseFrequency * (1 + Math.floor(progress * 4) * 0.19)
      sample = (Math.sin(Math.PI * 2 * stepped * t) * 0.44 + filteredNoise * 0.06) *
        envelope(t, duration, 0.01, 0.2)
    } else if (kind === 'emp') {
      const carrier = Math.sin(Math.PI * 2 * (baseFrequency + progress * 720) * t)
      const pulse = Math.sign(Math.sin(Math.PI * 2 * 34 * t))
      sample = (carrier * 0.38 + filteredNoise * pulse * 0.28) * envelope(t, duration, 0.006, 0.26)
    } else if (kind === 'warning') {
      const gate = Math.sin(Math.PI * 2 * 5.5 * t) > -0.15 ? 1 : 0.12
      sample = Math.sin(Math.PI * 2 * baseFrequency * t) * gate * envelope(t, duration, 0.005, 0.08) * 0.42
    } else {
      const beat = Math.exp(-(((t % 0.5) / 0.5) * 12))
      const bass = Math.sin(Math.PI * 2 * baseFrequency * t) * beat * 0.34
      const pulse = Math.sin(Math.PI * 2 * baseFrequency * 2 * t) * 0.09
      const hat = filteredNoise * (Math.sin(Math.PI * 2 * 4 * t) > 0.86 ? 0.12 : 0)
      const seam = Math.sin(Math.PI * Math.min(1, t / 0.04)) *
        Math.sin(Math.PI * Math.min(1, (duration - t) / 0.04))
      sample = (bass + pulse + hat) * seam
    }
    samples[index] = Math.round(clamp(sample) * 28_000)
  }
  return samples
}

const wav = (samples) => {
  const dataBytes = samples.length * 2
  const bytes = Buffer.alloc(44 + dataBytes)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(36 + dataBytes, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(CHANNELS, 22)
  bytes.writeUInt32LE(SAMPLE_RATE, 24)
  bytes.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28)
  bytes.writeUInt16LE(CHANNELS * 2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(dataBytes, 40)
  for (let index = 0; index < samples.length; index += 1) {
    bytes.writeInt16LE(samples[index], 44 + index * 2)
  }
  return bytes
}

const manifest = { schemaVersion: 1, cues: [] }
for (const [id, seed, duration, kind, baseFrequency] of cueSpecs) {
  const bytes = wav(synth(seed, duration, kind, baseFrequency))
  const path = `${id}.wav`
  writeFileSync(resolve(outputDir, path), bytes)
  manifest.cues.push({
    id,
    path,
    seed,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    duration,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    source: SOURCE,
  })
}

writeFileSync(resolve(outputDir, 'audio.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
