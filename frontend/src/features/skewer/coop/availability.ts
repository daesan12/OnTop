// 무료 협동 로비는 기본 공개한다. 명시적 false는 긴급 점검용으로 유지한다.
export const SKEWER_COOP_ENABLED = import.meta.env.VITE_SKEWER_COOP_ENABLED !== 'false'
// Quest 실기기 연결 검수가 끝날 때까지 온라인 요리사의 VR 선택만 잠근다.
export const SKEWER_CHEF_VR_ENABLED = false
