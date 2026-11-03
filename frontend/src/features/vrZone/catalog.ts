export const VR_PLAY_FEE = 10
export const VR_GAMES = [
  { id: 'skewer', name: '온탑 꼬치왕', players: '1인', description: '주문대로 음식을 꽂고 치즈·베이컨 큐브를 더해보세요.', available: true },
] as const
export type VrGameId = typeof VR_GAMES[number]['id']
export const VR_CATALOG_SLOTS = 3
export type VrPlayMode = 'vr' | 'pc'
