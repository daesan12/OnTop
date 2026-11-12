let pending: Promise<unknown> | undefined

/** The entry point can start the map request before importing its consumers. */
export function requestRenewalMap() {
  return pending ??= fetch('/generated/park-renewal/server-map.json', {
    cache: 'no-store',
    priority: 'high',
  }).then(response => {
    if (!response.ok) throw new Error('220m 공원 맵을 읽을 수 없습니다. generate-renewal-park.mjs를 실행해주세요.')
    return response.json()
  }).catch(error => {
    pending = undefined
    throw error
  })
}
