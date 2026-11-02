import {memo} from 'react'
import {PARK_LAYOUT as p} from '../../map/park'
import {MINI_PROPS} from '../../config/parkPlan'
/** Live map and scene use one placement source. */
export const GeneratedParkMapBackground=memo(function GeneratedParkMapBackground(){return <g aria-hidden="true" className="park-map-background">
  <rect x={-p.DRAFT_PARK.half} y={-p.DRAFT_PARK.half} width={p.DRAFT_PARK.size} height={p.DRAFT_PARK.size} rx={p.SETTINGS.park.wallCornerRadius} fill="#bdcea0" stroke="#72866b"/>
  {[...p.PATHS,{id:'perimeter',points:p.PERIMETER,width:p.SETTINGS.park.perimeterWidth}].map(r=><polyline key={r.id} points={r.points.map(v=>v.join(',')).join(' ')} fill="none" stroke="#e5dfc9" strokeWidth={r.width} strokeLinejoin="round"/>)}
  {/* The shared stone apron connects the fountain approach to both halls and the jumpmap. */}
  <rect data-map-court="vr" x={p.VR_COURT.x-p.VR_COURT.width/2} y={p.VR_COURT.z-p.VR_COURT.depth/2} width={p.VR_COURT.width} height={p.VR_COURT.depth} fill="#c8c0ad"/>
  <ellipse cx={p.SITES.lake.x} cy={p.SITES.lake.z} rx={p.SITES.lake.rx} ry={p.SITES.lake.rz} fill="#6a9c9a"/>
  {p.lake.CROSSINGS.map(c=>{
    const count=Math.ceil((c.endX-c.startX)/(c.kind==='wood'?.42:1.55)),step=(c.endX-c.startX)/count
    return <g key={c.id} data-map-crossing={c.kind}>
      {c.kind==='wood' ? <><line x1={c.startX} x2={c.endX} y1={c.z} y2={c.z} stroke="#997e59" strokeWidth={c.halfWidth*2}/>
        {Array.from({length:count},(_,i)=><line key={i} x1={c.startX+i*step} x2={c.startX+i*step} y1={c.z-c.halfWidth} y2={c.z+c.halfWidth} stroke="#6d593f" strokeWidth={.12}/>)}</>
        : Array.from({length:count},(_,i)=><rect key={i} x={c.startX+i*step+.12} y={c.z-c.halfWidth+.12} width={step-.24} height={c.halfWidth*2-.24} rx={.3} fill="#c7cbbd" stroke="#68786f" strokeWidth={.15}/>)}
    </g>
  })}
  <rect x={p.SITES.pagoda.x-13} y={p.SITES.pagoda.z-13} width={26} height={26} fill="#d4cbb5"/>
  <circle cx={p.SITES.fountain.x} cy={p.SITES.fountain.z} r={p.DRAFT_FOUNTAIN.plazaRadius} fill="#e0d7c4"/>
  <circle cx={p.SITES.fountain.x} cy={p.SITES.fountain.z} r={p.DRAFT_FOUNTAIN.basinRadius} fill="#7fa5b0"/>
  <ellipse cx={p.SITES.fitness.x} cy={p.SITES.fitness.z} rx={p.DRAFT_FITNESS_AREA.rx} ry={p.DRAFT_FITNESS_AREA.rz} fill="#c8c0ad"/>
  <circle cx={p.LIFE_PLAZA.x} cy={p.LIFE_PLAZA.z} r={p.LIFE_PLAZA.pavingRadius} fill="#eeeae0" stroke="#a5b7ac" strokeWidth={.6}/>
  {p.DRAFT_PAVILIONS.map(q=><circle key={q.id} cx={q.x} cy={q.z} r={4.5*q.scale} fill="#536b65" stroke="#c3a56b"/>)}
  {[p.SITES.vr,p.SITES.folk].map((site,i)=><rect key={i} x={site.x-MINI_PROPS[1].width/2} y={site.z-MINI_PROPS[1].depth/2} width={MINI_PROPS[1].width} height={MINI_PROPS[1].depth} transform={`rotate(${-p.VR_YAW*180/Math.PI} ${site.x} ${site.z})`} fill="#687868" stroke="#b69a69" strokeWidth={.6}/>)}
  {p.KIOSKS.map(k=><rect key={k.kind} x={k.x-k.width/2} y={k.z-k.depth/2} width={k.width} height={k.depth} transform={`rotate(${-k.yaw*180/Math.PI} ${k.x} ${k.z})`} fill="#8e7355"/>)}
  {p.DRAFT_TABLES.map(t=><circle key={t.id} data-table-id={t.id} cx={t.position[0]} cy={t.position[2]} r={1.3} fill="#a87d54"/>)}
  <text x={0} y={p.MAIN_GATE.z+4} textAnchor="middle" fontSize={5} fill="#25483b">입구</text>
</g>})
