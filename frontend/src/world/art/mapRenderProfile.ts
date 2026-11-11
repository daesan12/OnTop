/** New park visual policy. The existing MVP and game/character assets keep their contracts. */
export const SIMPLE_MAP=['layout-preview','park-integration'].includes(import.meta.env?.MODE)
export const MAP_RENDER_BUDGET={maxPixels:1280*720,maxDpr:1,shadows:false} as const
