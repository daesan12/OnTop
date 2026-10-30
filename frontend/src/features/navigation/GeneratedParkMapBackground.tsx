import {memo} from 'react'
import {PARK_LAYOUT as p} from '../../map/park'
/** Live map and scene use one placement source. */
export const GeneratedParkMapBackground=memo(function GeneratedParkMapBackground(){return <g aria-hidden="true" className="park-map-background">
  <rect x={-p.DRAFT_PARK.half} y={-p.DRAFT_PARK.half} width={p.DRAFT_PARK.size} height={p.DRAFT_PARK.size} rx={p.SETTINGS.park.wallCornerRadius} fill="#bdcea0" stroke="#72866b"/>
  {[...p.PATHS,{id:'perimeter',points:p.PERIMETER,width:p.SETTINGS.park.perimeterWidth}].map(r=><polyline key={r.id} points={r.points.map(v=>v.join(',')).join(' ')} fill="none" stroke="#e5dfc9" strokeWidth={r.width} strokeLinejoin="round"/>)}
  <ellipse cx={p.SITES.lake.x} cy={p.SITES.lake.z} rx={p.SITES.lake.rx} ry={p.SITES.lake.rz} fill="#6a9c9a"/>
  {p.lake.CROSSINGS.map(c=><line key={c.id} x1={c.startX} x2={c.endX} y1={c.z} y2={c.z} stroke={c.kind==='wood'?'#997e59':'#d3cdb9'} strokeWidth={c.halfWidth*2}/>)}
  <rect x={p.SITES.pagoda.x-13} y={p.SITES.pagoda.z-13} width={26} height={26} fill="#d4cbb5"/>
  <circle cx={p.SITES.fountain.x} cy={p.SITES.fountain.z} r={p.DRAFT_FOUNTAIN.plazaRadius} fill="#e0d7c4"/>
  <circle cx={p.SITES.fountain.x} cy={p.SITES.fountain.z} r={p.DRAFT_FOUNTAIN.basinRadius} fill="#7fa5b0"/>
  <ellipse cx={p.SITES.fitness.x} cy={p.SITES.fitness.z} rx={p.DRAFT_FITNESS_AREA.rx} ry={p.DRAFT_FITNESS_AREA.rz} fill="#c8c0ad"/>
  <circle cx={p.LIFE_PLAZA.x} cy={p.LIFE_PLAZA.z} r={p.LIFE_PLAZA.pavingRadius} fill="#eeeae0" stroke="#a5b7ac" strokeWidth={.6}/>
  {p.DRAFT_PAVILIONS.map(q=><circle key={q.id} cx={q.x} cy={q.z} r={4.5*q.scale} fill="#536b65" stroke="#c3a56b"/>)}
  {p.KIOSKS.map(k=><rect key={k.kind} x={k.x-k.width/2} y={k.z-k.depth/2} width={k.width} height={k.depth} transform={`rotate(${-k.yaw*180/Math.PI} ${k.x} ${k.z})`} fill="#8e7355"/>)}
  {p.DRAFT_TABLES.map(t=><circle key={t.id} data-table-id={t.id} cx={t.position[0]} cy={t.position[2]} r={1.3} fill="#a87d54"/>)}
  <text x={0} y={p.MAIN_GATE.z+4} textAnchor="middle" fontSize={5} fill="#25483b">입구</text>
</g>})
