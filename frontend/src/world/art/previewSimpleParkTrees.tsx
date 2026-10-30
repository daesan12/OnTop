import {memo} from 'react'
import {buildParkTreeParts,parkTreePlantings} from './parkTreeParts'
import {FacetedParkTreeInstances} from './FacetedParkTreeInstances'

const parts=buildParkTreeParts(parkTreePlantings)
export const SimpleParkTrees=memo(function SimpleParkTrees(){
  return <FacetedParkTreeInstances parts={parts} name="simple-park-trees" treeCount={parkTreePlantings.length}/>
})
