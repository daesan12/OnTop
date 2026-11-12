/** 낮밤은 공원에 유지하고, 플레이에 필요한 앞쪽 물체는 같은 밝기로 비춘다. */
export function StoneRumbleLighting() {
  return <>
    <hemisphereLight name="stone-fill" color="#edf3ff" groundColor="#a4a18b" intensity={2} />
    <directionalLight name="stone-key" position={[-12, 40, 15]} color="#fff4df" intensity={2.2} />
  </>
}
