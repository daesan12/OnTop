import { Matrix4, Mesh, Vector3, type SkinnedMesh } from 'three'

/** Same skinning as getVertexPosition, with each referenced bone matrix built
 * once per pose instead of once per weighted sole vertex. Morphs stay intact. */
export function createSoleSupport(mesh: SkinnedMesh, indices: readonly number[]) {
  const geometry = mesh.geometry
  const weights = geometry.getAttribute('skinWeight')
  const joints = geometry.getAttribute('skinIndex')
  const transforms = new Map<number, Matrix4>()
  const samples = indices.map(index => ({ index, influences: Array.from({ length: 4 }, (_, component) => {
    const weight = weights.getComponent(index, component)
    const joint = joints.getComponent(index, component)
    if (weight && !transforms.has(joint)) transforms.set(joint, new Matrix4())
    return { weight, joint }
  }).filter(({ weight }) => weight !== 0) }))
  const base = new Vector3(), point = new Vector3(), weighted = new Vector3()
  return () => {
    for (const [joint, matrix] of transforms)
      matrix.multiplyMatrices(mesh.skeleton.bones[joint]!.matrixWorld, mesh.skeleton.boneInverses[joint]!)
    let bottom = Infinity
    for (const { index, influences } of samples) {
      // Mesh includes current morph targets; SkinnedMesh would repeat skinning.
      Mesh.prototype.getVertexPosition.call(mesh, index, base)
      base.applyMatrix4(mesh.bindMatrix)
      weighted.set(0, 0, 0)
      for (const { weight, joint } of influences)
        weighted.addScaledVector(point.copy(base).applyMatrix4(transforms.get(joint)!), weight)
      weighted.applyMatrix4(mesh.bindMatrixInverse)
      bottom = Math.min(bottom, weighted.y)
    }
    return bottom
  }
}
