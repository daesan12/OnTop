import { BGM_VOLUME, setBgmSettings, useBgmSettings } from './bgm'

/** Inline control beside graphics quality and mouse sensitivity. */
export function BgmVolumeControl() {
  const volume = useBgmSettings(state => state.volume)
  const muted = useBgmSettings(state => state.muted)
  return <div className="manual-look-control" role="group" aria-label="배경음악">
    <span>배경음악</span>
    <input type="range" aria-label="배경음악 음량" min={BGM_VOLUME.min} max={BGM_VOLUME.max} step={1}
      value={volume} aria-valuetext={`${volume}%`} disabled={muted}
      onChange={event => setBgmSettings({ volume: Number(event.target.value) })} />
    <label>
      <input type="checkbox" checked={muted} onChange={event => setBgmSettings({ muted: event.target.checked })} />
      끄기
    </label>
  </div>
}
