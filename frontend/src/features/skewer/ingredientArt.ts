import type { IngredientId } from './game'

interface PathArt { d: string; fill?: string; stroke?: string; strokeWidth?: number }

/** Food illustrations for the recipe UI and the VR order board. */
export const INGREDIENT_ART: Record<IngredientId, PathArt[]> = {
  tomato: [
    { d: 'M12 12C1 15 5 38 18 39c14 1 24-18 13-25-6-4-12-5-19-2Z', fill: '#cf4935' },
    { d: 'm19 11-4-6 7 3 5-3-1 7-7 3-6-3Z', fill: '#507542' },
    { d: 'M11 21q-2 6 2 10', stroke: '#ef9b73', strokeWidth: 2.5 },
  ],
  pepper: [
    { d: 'M15 9q7-4 11 0 12-4 12 9l-3 16q-3 9-13 5-12 4-14-5L6 18Q6 7 15 9Z', fill: '#5d803e' },
    { d: 'm16 16-2 15m13-15-2 15', stroke: '#9db56d', strokeWidth: 3 },
    { d: 'm22 9 2-6 4 1-2 7Z', fill: '#426235' },
  ],
  shrimp: [
    { d: 'M29 8C8 0 0 30 20 35c9 3 20-4 15-10-5-6-14 4-17-3-3-6 7-11 12-7', stroke: '#e69c79', strokeWidth: 10 },
    { d: 'm30 33 8 6-1-13Z', fill: '#bf6a56' },
    { d: 'm11 14 6 4m-7 6 6-1m2 10 2-6', stroke: '#f4c6a1', strokeWidth: 2 },
  ],
  beef: [
    { d: 'M14 7h17q9 0 9 9v14q0 9-9 9H13q-8 0-8-8V17Q5 7 14 7Z', fill: '#9b5548' },
    { d: 'm12 13 7 9-5 9m10-18 7 18m-20-7 21-5', stroke: '#e5b89d', strokeWidth: 3 },
  ],
  cheese: [
    { d: 'M4 13Q17 6 32 9l8 24q-15-1-28 6Z', fill: '#efb941' },
    { d: 'm8 16 22-4m-16 22 20-4', stroke: '#ffe09a', strokeWidth: 2 },
    { d: 'M21 22a2 2 0 1 1-4 0 2 2 0 1 1 4 0M32 28a2 2 0 1 1-4 0 2 2 0 1 1 4 0', fill: '#cf8d28' },
  ],
  bacon: [
    { d: 'M3 14q8-10 16-2t20-4l2 23q-10 10-19 3T5 38Z', fill: '#bb573b' },
    { d: 'M5 20q7-8 15-2t19-3M7 30q8-7 16-1t17-3', stroke: '#f5d4a4', strokeWidth: 4 },
    { d: 'M9 15q4-3 8 0m9 18 8-2', stroke: '#7e351e', strokeWidth: 2 },
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
