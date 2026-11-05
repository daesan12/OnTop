import type { IngredientId } from './game'

interface PathArt { d: string; fill?: string; stroke?: string; strokeWidth?: number }

/** Food illustrations for the recipe UI and the VR order board. */
export const INGREDIENT_ART: Record<IngredientId, PathArt[]> = {
  tomato: [
    { d: 'M22 12a12 13 0 1 1 0 26 12 13 0 1 1 0-26Z', fill: '#db3820' },
    { d: 'M16 20q-3 4-1 8', stroke: '#ffd2ac', strokeWidth: 2.5 },
  ],
  pepper: [
    { d: 'M15 9q7-4 11 0 12-4 12 9l-3 16q-3 9-13 5-12 4-14-5L6 18Q6 7 15 9Z', fill: '#5d803e' },
    { d: 'm16 16-2 15m13-15-2 15', stroke: '#9db56d', strokeWidth: 3 },
    { d: 'm22 9 2-6 4 1-2 7Z', fill: '#426235' },
  ],
  shrimp: [
    { d: 'M29 8C8 0 0 30 20 35c9 3 20-4 15-10-5-6-14 4-17-3-3-6 7-11 12-7', stroke: '#e69c79', strokeWidth: 13 },
    { d: 'm30 33 8 6-1-13Z', fill: '#bf6a56' },
    { d: 'm11 14 6 4m-7 6 6-1m2 10 2-6', stroke: '#f4c6a1', strokeWidth: 2 },
  ],
  beef: [
    { d: 'M14 7h17q9 0 9 9v14q0 9-9 9H13q-8 0-8-8V17Q5 7 14 7Z', fill: '#9b5548' },
    { d: 'm12 13 7 9-5 9m10-18 7 18m-20-7 21-5', stroke: '#e5b89d', strokeWidth: 3 },
  ],
  cheese: [
    { d: 'M5 13 19 5 39 12 25 21Z', fill: '#ffe59a' },
    { d: 'M5 13 25 21 25 40 5 31Z', fill: '#edb63b' },
    { d: 'M25 21 39 12 39 31 25 40Z', fill: '#d28a22' },
    { d: 'M6 14 25 22 38 14', stroke: '#fff0b5', strokeWidth: 1.3 },
    { d: 'M12 23a2.3 3 0 1 1-4 0 2.3 3 0 1 1 4 0M22 31a2.6 3.3 0 1 1-5 0 2.6 3.3 0 1 1 5 0M32 25a1.7 2.2 0 1 1-3 0 1.7 2.2 0 1 1 3 0', fill: '#b77a23' },
    { d: 'm15 11 8 3', stroke: '#fff5c7', strokeWidth: 2 },
  ],
  bacon: [
    { d: 'M5 13 19 5 39 12 25 21Z', fill: '#e49c88' },
    { d: 'M5 13 25 21 25 40 5 31Z', fill: '#c66e5d' },
    { d: 'M25 21 39 12 39 31 25 40Z', fill: '#a84d40' },
    { d: 'M5 18 25 26 39 18 39 22 25 30 5 22Z M5 26 25 34 39 26 39 29 25 38 5 30Z', fill: '#ffe0bd' },
    { d: 'M10 10 29 18 34 15 15 7Z', fill: '#ffe9cc' },
    { d: 'M6 14 25 22 38 14', stroke: '#f5bda4', strokeWidth: 1.3 },
  ],
}

export function paintIngredient(ctx: CanvasRenderingContext2D, id: IngredientId): void {
  for (const art of INGREDIENT_ART[id]) {
    const path = new Path2D(art.d)
    if (art.fill) { ctx.fillStyle = art.fill; ctx.fill(path) }
    if (art.stroke) {
      ctx.strokeStyle = art.stroke
      ctx.lineWidth = art.strokeWidth ?? 1
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    }
  }
}
