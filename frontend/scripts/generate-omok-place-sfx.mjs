import { mkdirSync, writeFileSync } from 'node:fs'

// 직접 합성한 짧은 돌/목재 타격음. 외부 음원이나 점프맵의 확정 음원을 변경하지 않는다.
const rate = 44100, count = Math.round(rate * .14), pcm = new Float64Array(count)
let seed = 4187, previousNoise = 0
for (let i = 0; i < count; i++) {
  const t = i / rate, attack = Math.min(1, t / .0004)
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  const noise = seed / 0x80000000 - 1, high = noise - previousNoise
  previousNoise = noise
  pcm[i] = attack * (.55 * high * Math.exp(-t * 580)
    + .6 * Math.sin(2 * Math.PI * 1640 * t) * Math.exp(-t * 100)
    + .35 * Math.sin(2 * Math.PI * 790 * t) * Math.exp(-t * 75)
    + .18 * Math.sin(2 * Math.PI * 310 * t) * Math.exp(-t * 95))
}
const peak = Math.max(...pcm.map(Math.abs)), out = Buffer.alloc(44 + count * 2)
out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8)
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28)
out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40)
pcm.forEach((value, index) => out.writeInt16LE(Math.round(value / peak * .88 * 32767), 44 + index * 2))
const dir = new URL('../public/audio/omok/', import.meta.url)
mkdirSync(dir, { recursive: true }); writeFileSync(new URL('stone-place.wav', dir), out)
