/** 로비에서 공원 코드를 먼저 준비하고, 경기에서는 같은 모듈을 재사용한다. */
export function loadStoneRumblePark() {
  return import('./StoneRumbleEnvironment').then(module => ({ default: module.StoneRumbleEnvironment }))
}
