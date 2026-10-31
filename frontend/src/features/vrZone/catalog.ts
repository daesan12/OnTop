export const VR_PLAY_FEE = 10
export const VR_GAMES = [
  { id: 'skewer', name: '온탑 꼬치왕', players: '1인', description: '주문대로 음식을 꽂고 치즈와 베이컨으로 감싸보세요.', available: true },
] as const
export type VrGameId = typeof VR_GAMES[number]['id']
export const VR_CATALOG_SLOTS = 3
export type VrPlayMode = 'vr' | 'pc'
