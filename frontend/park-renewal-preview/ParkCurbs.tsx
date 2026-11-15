import { previewCurbs } from './previewCurbs'

export function ParkCurbs() {
  return (
  <mesh name="continuous-mitered-stone-curbs" geometry={previewCurbs}><meshLambertMaterial color="#beb9a5" side={2}/></mesh>
  )
}
