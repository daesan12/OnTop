export interface LegacyGroundIndex {
  triangles: number[]
  bins: Map<number, number[]>
}

export interface PackedGroundIndex {
  triangles: Uint32Array
  firstBin: number
  binOffsets: Uint32Array
  triangleIds: Uint32Array
}

export type GroundIndex = LegacyGroundIndex | PackedGroundIndex

export function groundBin(index: GroundIndex, key: number) {
  if ('bins' in index) return index.bins.get(key)
  const bin = key - index.firstBin
  const start = index.binOffsets[bin], end = index.binOffsets[bin + 1]
  if (start === undefined || end === undefined || start === end) return undefined
  return index.triangleIds.subarray(start, end)
}

/** Compact integer lookup generated from the original triangle and bin order. */
export function packGroundIndex(index: GroundIndex): PackedGroundIndex {
  if (!('bins' in index)) return index
  const keys = [...index.bins.keys()].sort((a, b) => a - b)
  const firstBin = keys[0] ?? 0
  const binCount = keys.length ? keys[keys.length - 1]! - firstBin + 1 : 0
  const binOffsets = new Uint32Array(binCount + 1)
  for (const [key, ids] of index.bins) binOffsets[key - firstBin + 1] = ids.length
  for (let i = 1; i < binOffsets.length; i++) binOffsets[i] = binOffsets[i]! + binOffsets[i - 1]!
  const triangleIds = new Uint32Array(binOffsets[binCount]!)
  for (const [key, ids] of index.bins) triangleIds.set(ids, binOffsets[key - firstBin])
  return { triangles: Uint32Array.from(index.triangles), firstBin, binOffsets, triangleIds }
}
