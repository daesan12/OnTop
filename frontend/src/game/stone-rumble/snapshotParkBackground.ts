import { Object3D } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

/** A decorative snapshot; geometry/material ownership stays with the mounted park. */
export function snapshotParkBackground(source: Object3D): Object3D {
  source.updateWorldMatrix(true, true)
  const snapshot = clone(source)
  snapshot.name = 'stone-renewal-shared-background'
  snapshot.userData = { ...snapshot.userData, stoneParkSnapshot: true }
  snapshot.matrix.copy(source.matrixWorld)
  snapshot.matrix.decompose(snapshot.position, snapshot.quaternion, snapshot.scale)
  snapshot.updateMatrixWorld(true)
  return snapshot
}
