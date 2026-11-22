import collision from './assets/collision.json'

/** Local metre-space hulls were derived from the normalized, approved meshes. */
export function christmasCollision(kind: string) {
  return (collision as Record<string, { vertices: number[]; radius: number; height: number }>)[kind]
}
