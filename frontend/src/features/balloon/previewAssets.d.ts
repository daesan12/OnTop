declare module '*열기구_로우폴리_1/asset.js' {
  export function createLowPolyBalloon(options: {
    quality: 'light'; accent: string; cream: string; decoration: 'simple'
  }): { group: import('three').Group; dispose: () => void }
}

declare module '*탑승장_로우폴리_1/asset.js' {
  export function createLowPolyStation(options: {
    quality: 'light'; deckAccent: string
  }): { group: import('three').Group; dispose: () => void }
}
