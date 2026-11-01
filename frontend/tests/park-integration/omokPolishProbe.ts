import { _roots } from '@react-three/fiber'
import { Matrix4, Vector3, type InstancedMesh, type Mesh, type MeshStandardMaterial, type MeshBasicMaterial } from 'three'
import { omokCamera } from '../../src/game/cameraState'

export function omokPolishProbe() {
  const { scene, camera } = _roots.get(document.querySelector('canvas')!)!.store.getState()
  scene.updateMatrixWorld(true)
  const board = scene.getObjectByName('omok-board-' + omokCamera.anchorId)!
  const surface = board.getObjectByName('gomoku-playing-surface') as Mesh
  const coords = board.getObjectByName('omok-board-coordinates') as Mesh
  const canvas = (coords.material as MeshBasicMaterial).map!.image as HTMLCanvasElement
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, 2048, 2048).data
  const edges = [0, 0, 0, 0]
  for (let y = 100; y < 1948; y++) for (let x = 0; x < 90; x++) {
    edges[0]! += pixels[(y * 2048 + x) * 4 + 3]! > 0 ? 1 : 0
    edges[1]! += pixels[(y * 2048 + 2047 - x) * 4 + 3]! > 0 ? 1 : 0
    edges[2]! += pixels[(x * 2048 + y) * 4 + 3]! > 0 ? 1 : 0
    edges[3]! += pixels[((2047 - x) * 2048 + y) * 4 + 3]! > 0 ? 1 : 0
  }
  const supplies = ['south', 'north'].map(side => {
    const mesh = board.getObjectByName('omok-supply-' + side)!.children[0] as InstancedMesh
    const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix)
    const p = mesh.localToWorld(new Vector3().setFromMatrixPosition(matrix)).project(camera)
    return { side, color: (mesh.material as MeshStandardMaterial).color.getHexString(), screenY: p.y }
  })
  return { edges, supplies, boardColor: (surface.material as MeshStandardMaterial).color.getHexString() }
}
