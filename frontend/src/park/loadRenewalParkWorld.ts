let pending: Promise<typeof import('../../park-renewal-preview/live/RenewalWorld')> | undefined

export function loadRenewalParkWorld() {
  return pending ??= (async () => {
    const [{ loadStaticPark }, { default: archive }] = await Promise.all([
      import('../../park-renewal-preview/static/load'),
      import('../../park-renewal-preview/original-park.bin.gz?url'),
    ])
    // The scene modules read this snapshot during evaluation.
    await loadStaticPark(archive)
    return import('../../park-renewal-preview/live/RenewalWorld')
  })().catch(error => {
    pending = undefined
    throw error
  })
}
