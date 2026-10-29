import { attachSharedMaterial, sharedOutdoorMetal } from './sharedMaterials'
/** Flat painted finishes share the park's texture-free lighting. */
export function OutdoorMetal({
  finish = 'painted',
  vertexColors = false,
}: {
  finish?: 'painted' | 'iron' | 'brass'
  vertexColors?: boolean
}) {
  return (
    <primitive object={sharedOutdoorMetal(finish, vertexColors)} attach={attachSharedMaterial} dispose={null} />
  )
}
