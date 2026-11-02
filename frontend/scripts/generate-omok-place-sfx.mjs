import { mkdirSync, writeFileSync } from 'node:fs'

// 직접 합성한 짧은 돌/목재 타격음. 외부 음원이나 점프맵의 확정 음원을 변경하지 않는다.
const rate = 44100, count = Math.round(rate * .065), pcm = new Float64Array(count)
let seed = 4187, low = 0, body = 0, dc = 0
for (let i = 0; i < count; i++) {
  const t = i / rate, attack = Math.min(1, t / .00015)
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  const noise = seed / 0x80000000 - 1
  // 광대역 충격과 낮은 목재 몸통만 남긴다. 음정·피치 변화·공명 꼬리를 만들지 않는다.
  low += .68 * (noise - low)
  body += .12 * (noise - body)
  dc += .025 * (low - dc)
  pcm[i] = attack * (1.5 * (low - dc) * Math.exp(-t * 520)
    + 1.1 * body * Math.exp(-t * 270))
}
const peak = Math.max(...pcm.map(Math.abs)), out = Buffer.alloc(44 + count * 2)
out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8)
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28)
out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40)
pcm.forEach((value, index) => out.writeInt16LE(Math.round(value / peak * .88 * 32767), 44 + index * 2))
const dir = new URL('../public/audio/omok/', import.meta.url)
mkdirSync(dir, { recursive: true }); writeFileSync(new URL('stone-tap.wav', dir), out)
