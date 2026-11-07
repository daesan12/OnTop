import { _roots } from '@react-three/fiber'
import { Box3, Matrix4, Vector3, type InstancedMesh, type Mesh, type MeshStandardMaterial, type MeshBasicMaterial, type PlaneGeometry } from 'three'
import { omokCamera } from '../../src/game/cameraState'

export function omokForbiddenMarksVisible() {
  return !!_roots.get(document.querySelector('canvas')!)?.store.getState().scene.getObjectByName('omok-forbidden-marks')
}

export function omokPolishProbe() {
  const { scene, camera } = _roots.get(document.querySelector('canvas')!)!.store.getState()
  scene.updateMatrixWorld(true)
  const board = scene.getObjectByName('omok-board-' + omokCamera.anchorId)!
  const surface = board.getObjectByName('gomoku-playing-surface') as Mesh
  const coords = board.getObjectByName('omok-board-coordinates') as Mesh
  const canvas = (coords.material as MeshBasicMaterial).map!.image as HTMLCanvasElement
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, 2048, 2048).data
  const edges = [0, 0, 0, 0]
  const ink = { minX:2048, minY:2048, maxX:0, maxY:0 }
  for (let y=0; y<2048; y++) for (let x=0; x<2048; x++) {
    if (pixels[(y*2048+x)*4+3]! === 0) continue
    ink.minX=Math.min(ink.minX,x); ink.maxX=Math.max(ink.maxX,x)
    ink.minY=Math.min(ink.minY,y); ink.maxY=Math.max(ink.maxY,y)
  }
  const coordinateSpan=(coords.geometry as PlaneGeometry).parameters.width
  const coordinateBounds={minX:(ink.minX/2048-.5)*coordinateSpan,maxX:(ink.maxX/2048-.5)*coordinateSpan,
    minZ:(ink.minY/2048-.5)*coordinateSpan,maxZ:(ink.maxY/2048-.5)*coordinateSpan}
  surface.geometry.computeBoundingBox()
  const surfaceBox=surface.geometry.boundingBox!.clone().applyMatrix4(new Matrix4().copy(board.matrixWorld).invert().multiply(surface.matrixWorld))
  const surfaceBounds={minX:surfaceBox.min.x,maxX:surfaceBox.max.x,minZ:surfaceBox.min.z,maxZ:surfaceBox.max.z}
  const bowlMesh=board.getObjectByName('omok-stone-bowls')?.children[0] as InstancedMesh | undefined
  const bowls=bowlMesh ? Array.from({length:bowlMesh.count},(_,i)=>{
    const matrix=new Matrix4(); bowlMesh.getMatrixAt(i,matrix); bowlMesh.geometry.computeBoundingBox()
    const local=new Matrix4().copy(board.matrixWorld).invert().multiply(bowlMesh.matrixWorld).multiply(matrix)
    const box=new Box3().copy(bowlMesh.geometry.boundingBox!).applyMatrix4(local)
    return {minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z}
  }) : []
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
  const corners = [[0, 0], [14, 0], [0, 14], [14, 14]].map(([x, y]) => {
    const p = board.localToWorld(new Vector3((x! / 14 - .5) * 1.3, .019, (y! / 14 - .5) * 1.3)).project(camera)
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }
  })
  const frameCorners=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([x,z])=>{
    const p=board.localToWorld(new Vector3(x!*coordinateSpan/2,.043,z!*coordinateSpan/2)).project(camera)
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}
  })
  return { edges, supplies, corners, frameCorners, coordinateBounds, surfaceBounds, bowls, boardColor: (surface.material as MeshStandardMaterial).color.getHexString() }
}
