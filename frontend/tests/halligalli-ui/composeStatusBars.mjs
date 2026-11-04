import path from 'node:path'
import sharp from 'sharp'

const directory = path.resolve('../docs/qa/halligalli-status-bar')
for (const [width, height, panelWidth] of [[1920, 1080, 640], [1366, 768, 455]]) {
  const panelHeight = Math.round(height * panelWidth / width)
  const buffers = await Promise.all([2, 3, 4].map(async players => {
    const source = path.join(directory, `${width}x${height}-${players}players.png`)
    return sharp(source).resize(panelWidth, panelHeight).composite([{
      input: Buffer.from(`<svg width="${panelWidth}" height="48"><rect width="170" height="38" x="12" y="10" rx="8" fill="#151713dd"/><text x="28" y="36" fill="#f7efe0" font-size="22" font-family="Malgun Gothic, sans-serif" font-weight="700">${players}인 경기</text></svg>`),
      top: 0, left: 0,
    }]).png().toBuffer()
  }))
  await sharp({ create: { width: panelWidth * 3, height: panelHeight, channels: 4, background: '#1b251e' } })
    .composite(buffers.map((input, index) => ({ input, left: index * panelWidth, top: 0 })))
    .png().toFile(path.join(directory, `${width}x${height}-comparison.png`))
}

const parkPanelWidth = 960
const parkPanelHeight = 540
const parkBuffers = await Promise.all([2, 4].map(async players => {
  const source = path.join(directory, `park-1920x1080-${players}players.png`)
  return sharp(source).resize(parkPanelWidth, parkPanelHeight).composite([{
    input: Buffer.from(`<svg width="${parkPanelWidth}" height="64"><rect width="190" height="46" x="16" y="12" rx="10" fill="#151713dd"/><text x="34" y="43" fill="#f7efe0" font-size="25" font-family="Malgun Gothic, sans-serif" font-weight="700">${players}인 경기</text></svg>`),
    top: 0, left: 0,
  }]).png().toBuffer()
}))
await sharp({ create: { width: parkPanelWidth * 2, height: parkPanelHeight, channels: 4, background: '#1b251e' } })
  .composite(parkBuffers.map((input, index) => ({ input, left: index * parkPanelWidth, top: 0 })))
  .png().toFile(path.join(directory, 'park-1920x1080-comparison.png'))
