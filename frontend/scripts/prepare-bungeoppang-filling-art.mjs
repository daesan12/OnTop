import sharp from 'sharp';
import { resolve } from 'node:path';

// Pack the generated four-column transparent artwork without changing its art.
const input = process.argv[2];
if (!input) throw new Error('Pass the generated four-column PNG path.');
const { width, height, hasAlpha } = await sharp(input).metadata();
if (!width || !height || width % 4 || !hasAlpha) throw new Error('Expected four equal columns and alpha transparency.');
const cells = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
  const cell = await sharp(input).extract({ left: index * width / 4, top: 0, width: width / 4, height }).png().toBuffer();
  return sharp(cell).trim().resize(256, 192, { fit: 'contain', background: '#00000000' }).png().toBuffer();
}));
const output = resolve('public/art/bungeoppang/filled-breads-25d.png');
await sharp({ create: { width: 1024, height: 192, channels: 4, background: '#00000000' } })
  .composite(cells.map((input, index) => ({ input, left: index * 256, top: 0 })))
  .png({ compressionLevel: 9 }).toFile(output);
console.log(output);
