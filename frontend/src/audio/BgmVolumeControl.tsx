import { BGM_VOLUME, setBgmSettings, setSfxSettings, useBgmSettings, useSfxSettings } from './bgm'

const kinds = {
  music: { label: '배경음악', use: useBgmSettings, set: setBgmSettings },
  effects: { label: '효과음', use: useSfxSettings, set: setSfxSettings },
}

/** Inline control beside graphics quality and mouse sensitivity. */
export function BgmVolumeControl({ kind = 'music' }: { kind?: keyof typeof kinds }) {
  const { label, use, set } = kinds[kind]
  const volume = use(state => state.volume)
  const muted = use(state => state.muted)
  return <div className="manual-look-control" role="group" aria-label={label}>
    <span>{label}</span>
    <input type="range" aria-label={`${label} 음량`} min={BGM_VOLUME.min} max={BGM_VOLUME.max} step={1}
      value={volume} aria-valuetext={`${volume}%`} disabled={muted}
      onChange={event => set({ volume: Number(event.target.value) })} />
    <label>
      <input type="checkbox" checked={muted} onChange={event => set({ muted: event.target.checked })} />
      끄기
    </label>
  </div>
}
