import { _roots } from '@react-three/fiber'
import { AmbientLight, Color, DirectionalLight, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, OrthographicCamera, Scene, ShaderLib, UniformsUtils, WebGLRenderer, type MeshStandardMaterial } from 'three'
import type { JumpTheme } from '../../src/layout-preview/jumpCourse'

/** Render the real service materials at fixed ages, independently of camera
 * interpolation. This fixture is only imported by the browser tests. */
export function sampleLandingMotion() {
  const root = _roots.get(document.querySelector('canvas')!)!.store.getState()
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(360, 280)
  const scene = new Scene(); scene.background = new Color('#17232f')
  scene.add(new AmbientLight('#e4f1ff', 1.7))
  const light = new DirectionalLight('#fff2d4', 3); light.position.set(-3, 5, 4); scene.add(light)
  const camera = new OrthographicCamera(-1.85, 1.85, 1.25, -1.62, .1, 30)
  camera.position.set(3.2, 3, 4.4); camera.lookAt(0, -.28, 0)
  const themes: JumpTheme[] = ['stone', 'gomoku', 'fish', 'cloud', 'lantern', 'kite', 'lily']
  const names = ['석탑 · 왁스 크랙', '오목돌 · 키캡', '붕어빵 · 크런치', '구름 · 스퀴시', '청사초롱 · 팝잇', '방패연 · 한지', '연잎 · 출렁임']
  const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = themes.length * 320 + 44
  const ctx = sheet.getContext('2d')!; ctx.fillStyle = '#17232f'; ctx.fillRect(0, 0, sheet.width, sheet.height)
  ctx.fillStyle = '#f3ead9'; ctx.font = '18px sans-serif'
  ;['원래 모양', '꾹 눌림 · 110ms', '탄성 복원 · 340ms', '안정 · 1.1s'].forEach((s, i) => ctx.fillText(s, i * 360 + 20, 28))
  const result: { theme: JumpTheme; pressed: number; release: number; settled: number; reduced: number; maxVertices: number }[] = []
  for (const [row, theme] of themes.entries()) {
    const source = root.scene.getObjectByName(`service-jump-${theme}`)!
    const group = new Group(), clocks = new Map<{ value: number }, number>()
    let maxVertices = 0
    for (const child of source.children) {
      const original = child as InstancedMesh, geometry = original.geometry.clone(), material = original.material as MeshStandardMaterial
      geometry.setAttribute('aFade', new InstancedBufferAttribute(new Float32Array([1]), 1))
      geometry.setAttribute('aHit', new InstancedBufferAttribute(new Float32Array([100]), 1))
      geometry.setAttribute('aPower', new InstancedBufferAttribute(new Float32Array([1]), 1))
      const mesh = new InstancedMesh(geometry, material, 1); mesh.setMatrixAt(0, new Matrix4()); mesh.setColorAt(0, new Color('#ffffff')); group.add(mesh)
      const shader = { ...ShaderLib.standard, uniforms: UniformsUtils.clone(ShaderLib.standard.uniforms) } as Parameters<MeshStandardMaterial['onBeforeCompile']>[0]
      material.onBeforeCompile(shader, renderer)
      const uniform = shader.uniforms.jumpTime! as { value: number }
      if (!clocks.has(uniform)) clocks.set(uniform, uniform.value)
      maxVertices = Math.max(maxVertices, geometry.getAttribute('position').count)
    }
    scene.add(group)
    const pixels: Uint8Array[] = []
    for (const [column, age] of [0, .11, .34, 1.1, .11].entries()) {
      for (const c of clocks.keys()) c.value = 100 + age
      if (column === 4) group.children.forEach(node => { ((node as InstancedMesh).geometry.getAttribute('aPower') as InstancedBufferAttribute).setX(0, 0); (node as InstancedMesh).geometry.getAttribute('aPower').needsUpdate = true })
      renderer.render(scene, camera)
      const buffer = new Uint8Array(360 * 280 * 4)
      renderer.getContext().readPixels(0, 0, 360, 280, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, buffer)
      pixels.push(buffer)
      if (column < 4) ctx.drawImage(renderer.domElement, column * 360, row * 320 + 44)
    }
    const difference = (index: number) => {
      let changed = 0
      for (let p = 0; p < pixels[0]!.length; p += 4) if (Math.abs(pixels[0]![p]! - pixels[index]![p]!) + Math.abs(pixels[0]![p + 1]! - pixels[index]![p + 1]!) + Math.abs(pixels[0]![p + 2]! - pixels[index]![p + 2]!) > 12) changed++
      return changed
    }
    result.push({ theme, pressed: difference(1), release: difference(2), settled: difference(3), reduced: difference(4), maxVertices })
    ctx.fillStyle = '#f3ead9'; ctx.fillText(names[row]!, 20, row * 320 + 344)
    clocks.forEach((previous, c) => { c.value = previous })
    scene.remove(group); group.children.forEach(node => { const mesh = node as InstancedMesh; mesh.geometry.dispose(); mesh.dispose() })
  }
  renderer.dispose()
  return { result, image: sheet.toDataURL('image/png') }
}

export function landingPower(block: number) {
  const scene = _roots.get(document.querySelector('canvas')!)!.store.getState().scene
  const group = scene.getObjectByName('service-jump-course')!
  let max = 0
  group.traverse(node => { const mesh = node as InstancedMesh; if (!mesh.isInstancedMesh) return; const power = mesh.geometry.getAttribute('aPower'); if (power) max = Math.max(max, power.getX(block)) })
  return max
}
