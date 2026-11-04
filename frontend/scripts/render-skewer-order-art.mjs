import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

// Bake the recipe-driven menu illustration; PNG also works on the immersive canvas board.
const origin = process.argv[2] ?? 'http://127.0.0.1:5244'
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
try {
  const page = await browser.newPage()
  await page.goto(`${origin}/skewer-chef.html?mode=pc`)
  const pictures = await page.evaluate(async () => {
    const { menuSkewerIllustration } = await import('/src/features/skewer/serviceHall/menuSkewerIllustration.ts')
    const { COOPERATIVE_RECIPES } = await import('/src/features/skewer/cooperativeMenu.ts')
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 340
    const ctx = canvas.getContext('2d'), pictures = []
    for (const recipe of COOPERATIVE_RECIPES) {
      const image = new Image()
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(menuSkewerIllustration(recipe))}`
      await image.decode(); ctx.clearRect(0, 0, 960, 340); ctx.drawImage(image, 0, 0)
      pictures.push(canvas.toDataURL('image/png'))
    }
    return pictures
  })
  for (const [index, data] of pictures.entries()) {
    await writeFile(new URL(`../src/features/skewer/serviceHall/art/order-${index + 1}.png`, import.meta.url),
      Buffer.from(data.split(',')[1], 'base64'))
  }
  console.log(`Rendered ${pictures.length} illustrated skewers from actual recipes.`)
} finally {
  await browser.close()
}
