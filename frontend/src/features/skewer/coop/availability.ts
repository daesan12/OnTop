// 무료 협동 로비는 기본 공개한다. 명시적 false는 긴급 점검용으로 유지한다.
export const SKEWER_COOP_ENABLED = import.meta.env.VITE_SKEWER_COOP_ENABLED !== 'false'
// 온라인 요리사도 기존 WebXR 연결·준비 흐름으로 VR을 선택할 수 있다.
export const SKEWER_CHEF_VR_ENABLED = true
