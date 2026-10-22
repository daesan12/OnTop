import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CanvasTexture,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  VideoTexture,
  type Texture,
} from 'three'
import { type Vec3 } from '../../config'
import { environmentFrame as frame } from '../environmentState'
import {
  ADVERTISEMENT_FORMATS,
  advertisementSize,
  type AdvertisementFormat,
} from './advertisementFormats'
import {
  ADVERTISEMENTS,
  advertisementPlayback,
  sampleAdvertisementMedia,
  playsAdvertisementVideo,
  usesPortraitAdvertisement,
} from './advertisementMedia'
import { createAdvertisementGeometry } from './advertisementGeometry'
export { ADVERTISEMENTS } from './advertisementMedia'

interface MediaResource {
  poster: Texture
  portraitPoster?: Texture
  texture: Texture
  video?: HTMLVideoElement
  videoTexture?: VideoTexture
  visibleAt: number
  failed: boolean
  pending: boolean
  retryAt: number
}
const Resources = createContext<MediaResource[]>([])
function fallbackTexture(ad: (typeof ADVERTISEMENTS)[number]) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 1024
  const c = canvas.getContext('2d')!
  c.fillStyle = ad.color
  c.fillRect(0, 0, 768, 1024)
  c.strokeStyle = '#e6d2ad'
  c.lineWidth = 2
  c.strokeRect(30, 30, 708, 964)
  c.fillStyle = '#f2e4ca'
  c.textAlign = 'center'
  c.font = '24px "Malgun Gothic",sans-serif'
  c.fillText('O N T A P   /   온 탑', 384, 115)
  c.font = 'bold 64px "Malgun Gothic",sans-serif'
  c.fillText(ad.title, 384, 260, 650)
  c.font = '26px "Malgun Gothic",sans-serif'
  c.fillText(ad.subtitle, 384, 325, 650)
  c.beginPath()
  c.arc(384, 600, 180, Math.PI, 0)
  c.lineTo(564, 760)
  c.lineTo(204, 760)
  c.fill()
  c.fillStyle = ad.color
  c.beginPath()
  c.arc(445, 570, 125, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = ad.color
  c.lineWidth = 10
  c.beginPath()
  c.moveTo(200, 700)
  c.lineTo(570, 700)
  c.stroke()
  c.fillStyle = '#ead8b9'
  c.font = '22px "Malgun Gothic",sans-serif'
  c.fillText('잠시 후 광고 이미지가 표시됩니다', 384, 915)
  const texture = new CanvasTexture(canvas)
  texture.name = ad.id
  texture.colorSpace = SRGBColorSpace
  return texture
}
export function AdvertisementResources({ children }: { children: ReactNode }) {
  const resources = useMemo<MediaResource[]>(
    () =>
      ADVERTISEMENTS.map((ad) => {
        const poster = fallbackTexture(ad)
        return {
          poster,
          texture: poster,
          visibleAt: -Infinity,
          failed: false,
          pending: false,
          retryAt: 0,
        }
      }),
    [],
  )
  useEffect(() => {
    let live = true
    // The image slot and film fallback share the same two files and GPU textures.
    const urls = new Set(
      ADVERTISEMENTS.flatMap((ad) =>
        [ad.imageUrl, ad.portraitImageUrl].filter(
          (url): url is string => !!url,
        ),
      ),
    )
    const loader = new TextureLoader()
    urls.forEach((url) => {
      loader.load(
        url,
        (texture) => {
          if (!live) {
            texture.dispose()
            return
          }
          texture.colorSpace = SRGBColorSpace
          texture.name = url
          texture.anisotropy = 16
          ADVERTISEMENTS.forEach((ad, i) => {
            const resource = resources[i]
            if (ad.imageUrl === url) {
              const usingPoster = resource.texture === resource.poster
              resource.poster.dispose()
              resource.poster = texture
              if (usingPoster || !resource.videoTexture || resource.failed)
                resource.texture = texture
            }
            if (ad.portraitImageUrl === url) resource.portraitPoster = texture
          })
        },
        undefined,
        () => {
          /* Keep the labelled fallback on a failed image. */
        },
      )
    })
    const pause = () => {
      if (document.hidden) resources.forEach((r) => r.video?.pause())
    }
    const retry = () =>
      resources.forEach((r) => {
        r.retryAt = 0
      })
    document.addEventListener('visibilitychange', pause)
    document.addEventListener('pointerdown', retry)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', pause)
      document.removeEventListener('pointerdown', retry)
      const posters = new Set<Texture>()
      for (const r of resources) {
        if (r.video) {
          r.video.onloadeddata = r.video.onerror = null
          r.video.pause()
          r.video.removeAttribute('src')
          r.video.load()
          r.video.remove()
        }
        posters.add(r.poster)
        if (r.portraitPoster) posters.add(r.portraitPoster)
        r.videoTexture?.dispose()
      }
      posters.forEach((texture) => texture.dispose())
    }
  }, [resources])
  useFrame(() => {
    const now = performance.now()
    resources.forEach((r, i) => {
      const ad = ADVERTISEMENTS[i]
      if (!ad.videoUrl || r.failed) return
      const playback = advertisementPlayback(
        i,
        frame.serverTime,
        r.video?.duration ?? 0,
      )
      const active =
        playback.visible && !document.hidden && now - r.visibleAt < 750
      if (!active) {
        r.video?.pause()
        return
      }
      if (!r.video) {
        const video = document.createElement('video')
        r.video = video
        video.dataset.adId = ad.id
        video.hidden = true
        video.muted = true
        video.defaultMuted = true
        video.volume = 0
        video.playsInline = true
        video.loop = false
        video.preload = 'auto'
        video.crossOrigin = 'anonymous'
        video.onloadeddata = () => {
          if (!r.videoTexture) {
            r.videoTexture = new VideoTexture(video)
            r.videoTexture.name = ad.id
            r.videoTexture.colorSpace = SRGBColorSpace
            r.videoTexture.anisotropy = 8
          }
          if (!video.paused) r.texture = r.videoTexture
        }
        video.onerror = () => {
          r.failed = true
          r.texture = r.poster
          video.pause()
        }
        video.src = ad.videoUrl
        document.body.append(video)
      }
      const video = r.video
      if (
        video.readyState >= 2 &&
        Number.isFinite(video.duration) &&
        !video.seeking &&
        Math.abs(video.currentTime - playback.seconds) > 0.7
      )
        video.currentTime = playback.seconds
      if (video.paused && !video.ended && !r.pending && now >= r.retryAt) {
        r.pending = true
        video
          .play()
          .catch(() => {
            r.texture = r.poster
            r.retryAt = performance.now() + 5000
          })
          .finally(() => {
            r.pending = false
          })
      } else if (!video.paused && r.videoTexture) r.texture = r.videoTexture
    })
  })
  return <Resources.Provider value={resources}>{children}</Resources.Provider>
}
export function AdvertisementScreen({
  position,
  width,
  format,
  slotId,
  arc = 0,
}: {
  position: Vec3
  width: number
  format: AdvertisementFormat
  slotId: string
  arc?: number
}) {
  const { height } = advertisementSize(format, width)
  const resources = useContext(Resources)
  const geometry = useMemo(
    () => createAdvertisementGeometry(width, height, arc),
    [width, height, arc],
  )
  const material = useMemo(
    () =>
      new ShaderMaterial({
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        // Posters are display content; preserve their colors instead of applying
        // the park's cinematic tone mapping. Night dimming remains below.
        toneMapped: false,
        uniforms: {
          current: { value: resources[0].texture },
          next: { value: resources[0].texture },
          blend: { value: 0 },
          brightness: { value: 1 },
          aspect: { value: width / height },
          currentAspect: { value: 0.75 },
          nextAspect: { value: 0.75 },
          currentVideo: { value: 0 },
          nextVideo: { value: 0 },
        },
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform sampler2D current,next;uniform float blend,brightness,aspect,currentAspect,nextAspect,currentVideo,nextVideo;varying vec2 vUv;
    vec3 poster(sampler2D art,float artAspect,float video){
      vec2 uv=vUv;
      if(aspect>artAspect)uv.x=(uv.x-.5)*aspect/artAspect+.5;else uv.y=(uv.y-.5)*artAspect/aspect+.5;
      if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)return vec3(.018,.025,.023);
      vec3 c=texture2D(art,uv).rgb;
      if(video>.5)c=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
      return c;
    }
    void main(){
    vec3 c=mix(poster(current,currentAspect,currentVideo),poster(next,nextAspect,nextVideo),blend);
    gl_FragColor=vec4(c*brightness,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
      }),
    [resources, width, height],
  )
  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )
  useFrame(() => {
    const ad = sampleAdvertisementMedia(frame.serverTime)
    for (const [key, index] of [
      ['current', ad.current],
      ['next', ad.next],
    ] as const) {
      const resource = resources[index]
      const activeTexture =
        key === 'current' &&
        playsAdvertisementVideo(ADVERTISEMENTS[index], format)
          ? resource.texture
          : resource.poster
      const texture =
        usesPortraitAdvertisement(format) &&
        resource.portraitPoster &&
        activeTexture === resource.poster
          ? resource.portraitPoster
          : activeTexture
      const image = texture.image as
        HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
      material.uniforms[key].value = texture
      material.uniforms[`${key}Aspect`].value =
        image instanceof HTMLVideoElement
          ? image.videoWidth / image.videoHeight || 0.75
          : image.width / image.height
      material.uniforms[`${key}Video`].value =
        texture instanceof VideoTexture ? 1 : 0
    }
    material.uniforms.blend.value = ad.blend
    material.uniforms.brightness.value = 1 - frame.night * 0.35
  })
  return (
    <mesh
      name="rotating-advertisement"
      onClick={(e) => {
        const ad = sampleAdvertisementMedia(frame.serverTime)
        if (
          e.delta < 5 &&
          ADVERTISEMENTS[ad.blend > 0.5 ? ad.next : ad.current].id.startsWith(
            'pickus',
          )
        ) {
          e.stopPropagation()
          window.dispatchEvent(new Event('ontap-open-pickus'))
        }
      }}
      position={[...position]}
      geometry={geometry}
      onBeforeRender={() => {
        const ad = sampleAdvertisementMedia(frame.serverTime)
        const now = performance.now()
        if (playsAdvertisementVideo(ADVERTISEMENTS[ad.current], format))
          resources[ad.current].visibleAt = now
        if (
          ad.blend > 0 &&
          playsAdvertisementVideo(ADVERTISEMENTS[ad.next], format)
        )
          resources[ad.next].visibleAt = now
      }}
      userData={{
        advertisements: ADVERTISEMENTS.map((a) => a.id),
        slotId,
        format,
        recommendedPixels: ADVERTISEMENT_FORMATS[format].pixels,
      }}
    >
      <primitive object={material} attach="material" />
    </mesh>
  )
}
