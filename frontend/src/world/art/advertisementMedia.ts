import { ENVIRONMENT } from '../../config'
import type { AdvertisementFormat } from './advertisementFormats'
import pickusLandscape from '../../assets/entry/adv_pickus_1.webp'
import pickusPortrait from '../../assets/entry/adv_pickus_2.webp'
import pickusNew from '../../assets/entry/adv_pickus_4.webp'
import deroPoster from '../../assets/entry/dero-poster.webp'

export interface AdvertisementMedia {
  id: string
  title: string
  subtitle: string
  color: string
  imageUrl: string
  /** Full portrait artwork for square/portrait panels; also used for video fallback. */
  portraitImageUrl?: string
  /** Same-origin file or CORS-enabled direct MP4/WebM, never a YouTube page URL. */
  videoUrl?: string
  /** Measured source metadata. Keep in sync when replacing the file so all clients share a timeline. */
  videoDurationSeconds?: number
  /** Other panel shapes keep their aspect-appropriate poster during this slot. */
  videoFormats?: readonly AdvertisementFormat[]
}
export const ADVERTISEMENTS: readonly AdvertisementMedia[] = [
  {
    id: 'pickus-poster',
    title: 'PICKUS',
    subtitle: '사진을 PICK! 그대로 찰칵!',
    color: '#ff510f',
    imageUrl: pickusLandscape,
    portraitImageUrl: pickusPortrait,
  },
  {
    id: 'pickus-film',
    title: 'PICKUS',
    subtitle: '좋아하는 구도, 이제 내 사진으로',
    color: '#ff510f',
    imageUrl: pickusLandscape,
    portraitImageUrl: pickusPortrait,
    videoUrl: '/art/advertisements/adv_pickus_3.mp4',
    videoDurationSeconds: 10,
    videoFormats: ['vertical', 'portrait', 'poster'],
  },
  {
    id: 'pickus-new',
    title: 'PICKUS',
    subtitle: '사진을 PICK! 그대로 찰칵!',
    color: '#ff510f',
    imageUrl: pickusNew,
  },
  {
    id: 'dero-film',
    title: 'DERO',
    subtitle: '영상 광고',
    color: '#253c3c',
    imageUrl: deroPoster,
    videoUrl: '/art/advertisements/adv_dero_1.mp4',
    videoDurationSeconds: 13.7,
  },
]

/** Prefer the tall creative on compact/tall panels without cropping either artwork. */
export function usesPortraitAdvertisement(format: AdvertisementFormat) {
  return format !== 'wide' && format !== 'landscape'
}

export function playsAdvertisementVideo(
  ad: AdvertisementMedia,
  format: AdvertisementFormat,
) {
  return !!ad.videoUrl && (!ad.videoFormats || ad.videoFormats.includes(format))
}

export const MAX_ADVERTISEMENT_VIDEO_MS = 20_000

export function createAdvertisementSchedule(
  media: readonly AdvertisementMedia[],
) {
  const durations = media.map((ad) => {
    if (!ad.videoUrl) return ENVIRONMENT.adDurationMs
    const seconds = ad.videoDurationSeconds
    return seconds && Number.isFinite(seconds) && seconds > 0
      ? Math.min(MAX_ADVERTISEMENT_VIDEO_MS, seconds * 1000)
      : MAX_ADVERTISEMENT_VIDEO_MS
  })
  return {
    durations,
    totalMs: durations.reduce((sum, duration) => sum + duration, 0),
  }
}
export const ADVERTISEMENT_SCHEDULE =
  createAdvertisementSchedule(ADVERTISEMENTS)

/** Variable-length slots stay synchronized across screens, late joins and hidden tabs. */
export function sampleAdvertisementMedia(
  time: number,
  schedule = ADVERTISEMENT_SCHEDULE,
) {
  if (!schedule.durations.length)
    return { current: 0, next: 0, blend: 0, elapsedMs: 0 }
  let elapsedMs =
    ((time % schedule.totalMs) + schedule.totalMs) % schedule.totalMs
  let current = 0
  while (
    current < schedule.durations.length - 1 &&
    elapsedMs >= schedule.durations[current]
  ) {
    elapsedMs -= schedule.durations[current++]
  }
  const duration = schedule.durations[current]
  const fadeMs = Math.min(ENVIRONMENT.adFadeMs, duration)
  const t = Math.max(0, Math.min(1, (elapsedMs - duration + fadeMs) / fadeMs))
  return {
    current,
    next: (current + 1) % schedule.durations.length,
    blend: t * t * (3 - 2 * t),
    elapsedMs,
  }
}

/** Start at zero on entry, never loop a short film or pre-play it in the previous slot. */
export function advertisementPlayback(
  index: number,
  time: number,
  duration: number,
  schedule = ADVERTISEMENT_SCHEDULE,
) {
  const s = sampleAdvertisementMedia(time, schedule)
  return {
    visible: s.current === index,
    seconds:
      duration > 0 && Number.isFinite(duration)
        ? Math.min(
            s.elapsedMs / 1000,
            duration,
            MAX_ADVERTISEMENT_VIDEO_MS / 1000,
          )
        : 0,
  }
}
