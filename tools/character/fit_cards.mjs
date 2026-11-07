// Fit item_art.py pictures (*.raw.png) to wardrobe cards like the existing ones: the content trimmed, its longer
// side 232 px, centred on a transparent 320 px square, WebP. Run from the repository root (sharp comes from frontend):
// node tools/character/fit_cards.mjs <out_dir> <raw.png>=<name> ...
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('frontend/package.json'))
const sharp = require('sharp')
const [outDir, ...jobs] = process.argv.slice(2)
for (const job of jobs) {
  const [src, name] = job.split('=')
  const trimmed = await sharp(src).trim().toBuffer()
  const inner = await sharp(trimmed).resize(232, 232, { fit: 'inside' }).toBuffer({ resolveWithObject: true })
  const { width, height } = inner.info
  await sharp({ create: { width: 320, height: 320, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner.data, left: Math.round((320 - width) / 2), top: Math.round((320 - height) / 2) }])
    .webp({ quality: 90 }).toFile(path.join(outDir, `${name}.webp`))
  console.log(name, width, height)
}
