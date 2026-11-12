import { memo } from 'react'
import { SUMMIT_OUTLINE } from '../../../park-renewal-preview/hybridTerrainPlan'
import {
  BRIDGE, DOCK_ACCESS, EDGES, ENTRANCE_PATHS, FISHING_ACCESS, LAKE, NODES, PARK, SITES, TOWER_ACCESS,
  facilityFootprint, footprintDistance, inLake, insidePark, onRoad, parkRadius, site, type Point,
} from '../../../park-renewal-preview/plan'
import { renewalMap } from '../../park/renewalMap'

const svgPoints = (points: readonly Point[]) => points.map(point => point.join(',')).join(' ')
const outline = svgPoints(Array.from({ length: 160 }, (_, index) => {
  const angle = index / 160 * Math.PI * 2, radius = parkRadius(angle)
  return [PARK.rx * radius * Math.cos(angle), PARK.rz * radius * Math.sin(angle)]
}))
const roads = [
  ...EDGES.map(([a, b, width]) => ({ points: [NODES[a]!, NODES[b]!], width })),
  ...ENTRANCE_PATHS.map(({ a, b, width }) => ({ points: [a, b], width })),
  DOCK_ACCESS, FISHING_ACCESS, TOWER_ACCESS,
].map(({ points, width }) => ({ points: svgPoints(points), width }))
const fountain = site('fountain'), fitness = site('fitness'), pagoda = site('pagoda'), tower = site('tower')
const buildings = ['vr', 'bread', 'pigeon', 'mole', 'arcade', 'shooting', 'folk', 'cafe', 'lottery', 'ranking', 'mailbox', 'gacha']
  .map(id => {
    const building = site(id)
    return { ...building, ...facilityFootprint(building) }
  })
const jump = site('jump')
const plaza = site('plaza')
const rentals = SITES.filter(s => s.asset === 'pair')
const footprints = SITES.filter(s => !s.kind && s.id !== 'lake')

function foliage() {
  const trees: { x: number; z: number; size: number; dark: boolean }[] = []
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 24; col++) {
      const i = row * 24 + col
      const x = -103 + col * 9 + Math.sin(i * 12.17) * 3
      const z = -103 + row * 9 + Math.cos(i * 9.41) * 3
      if (Math.sin(x * .08) * Math.cos(z * .065) < -.5 || !insidePark(x, z, 4) || inLake(x, z, 3)
        || onRoad(x, z, 2.5) || footprints.some(s => footprintDistance(s, x, z) < 2.2)) continue
      trees.push({ x, z, size: 1.4 + (i % 5) * .29, dark: i % 3 === 0 })
    }
  }
  return trees
}

function octagon(radius: number) {
  return svgPoints(Array.from({ length: 8 }, (_, i) => {
    const angle = Math.PI / 8 + i * Math.PI / 4
    return [radius * Math.cos(angle), radius * Math.sin(angle)]
  }))
}

function PavilionRoof({ x, z, radius }: { x: number; z: number; radius: number }) {
  return <g transform={`translate(${x} ${z})`}>
    <polygon points={octagon(radius + 1.45)} fill="#dbc59e" stroke="#a7926c" strokeWidth=".45"/>
    <polygon points={octagon(radius)} transform="translate(.75 1.2)" fill="#40554b" opacity=".28"/>
    <polygon points={octagon(radius)} fill="url(#renewal-map-roof)" stroke="#314b4b" strokeWidth=".65"/>
    <polygon points={octagon(radius * .46)} fill="#819897" stroke="#b3c3b7" strokeWidth=".38"/>
    <path d={`M${-radius * .9} 0H${radius * .9}M0 ${-radius * .9}V${radius * .9}`} stroke="#b3c3b7" strokeWidth=".32" opacity=".75"/>
    <circle r=".8" fill="#e2c68d"/>
  </g>
}

export const RenewalParkMapBackground = memo(function RenewalParkMapBackground() {
  const map = renewalMap!.data
  const trees = foliage()
  return <g className="park-map-background" aria-hidden="true" data-park-map="renewal-220">
    <defs>
      <linearGradient id="renewal-map-grass" x1="12%" y1="7%" x2="86%" y2="97%">
        <stop stopColor="#c7d2a1"/><stop offset=".55" stopColor="#b3c58d"/><stop offset="1" stopColor="#d9d8a5"/>
      </linearGradient>
      <radialGradient id="renewal-map-water" cx=".36" cy=".26" r=".82">
        <stop stopColor="#9ec8c0"/><stop offset=".72" stopColor="#629d99"/><stop offset="1" stopColor="#477e7f"/>
      </radialGradient>
      <linearGradient id="renewal-map-roof" x2="70%" y2="100%">
        <stop stopColor="#738e8b"/><stop offset=".48" stopColor="#557575"/><stop offset="1" stopColor="#3b575d"/>
      </linearGradient>
      <pattern id="renewal-map-paper" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M1 1h.8M5 4h1M2 6h.6" stroke="#586646" strokeWidth=".23" opacity=".24"/>
      </pattern>
      <clipPath id="renewal-map-outline"><polygon points={outline}/></clipPath>
      <clipPath id="renewal-map-lake"><ellipse cx={LAKE.x} cy={LAKE.z} rx={LAKE.rx} ry={LAKE.rz}/></clipPath>
      <g id="renewal-map-tree">
        <ellipse cx=".5" cy=".55" rx="1.05" ry=".75" fill="#324b3a" opacity=".2"/>
        <path d="M-1.12 .34Q-1.38-.34-.71-.63Q-.67-1.3.08-1.17Q.62-1.3.83-.63Q1.43-.44 1.07.32Q.91.9.12.79Q-.52 1.1-1.12.34Z" fill="currentColor"/>
        <path d="M-.82-.24Q-.72-.82.06-.88" fill="none" stroke="#edf0c8" strokeWidth=".17" opacity=".55"/>
      </g>
      <g id="renewal-map-rental" fill="none" stroke="#3c5d52" strokeWidth=".44" strokeLinecap="round" strokeLinejoin="round">
        <rect x="-6.3" y="-2.8" width="12.6" height="5.6" rx="1.7" fill="#f7edd1" stroke="#9f906d"/>
        <circle cx="-4.6" cy=".9" r=".95"/><circle cx="-1.2" cy=".9" r=".95"/>
        <path d="M-4.6 .9l1.1-1.5 1 1.5h-2.1m2.1 0 1-2.4h.55m-.55 0 .3 2.4m-2.8-1.5h.85"/>
        <circle cx="1.7" cy="1.1" r=".48"/><circle cx="4.55" cy="1.1" r=".48"/>
        <path d="M1.7 .62h2.35l-.65-2.18h1.15"/>
      </g>
    </defs>
    <polygon points={outline} transform="translate(0 2.4)" fill="#71795b" opacity=".28"/>
    <polygon points={outline} fill="url(#renewal-map-grass)" stroke="#6a7d5d" strokeWidth="2"/>
    <g clipPath="url(#renewal-map-outline)">
      <rect x="-120" y="-120" width="240" height="240" fill="url(#renewal-map-paper)"/>
      <polygon points={svgPoints(SUMMIT_OUTLINE)} transform="translate(0 2)" fill="#7e9566" opacity=".56"/>
      <polygon points={svgPoints(SUMMIT_OUTLINE)} fill="#aec18a" stroke="#8ea377" strokeWidth=".8"/>
      <ellipse cx={LAKE.x} cy={LAKE.z} rx={LAKE.rx+1.7} ry={LAKE.rz+1.7} fill="#d8cd9c"/>
      <ellipse cx={LAKE.x} cy={LAKE.z} rx={LAKE.rx} ry={LAKE.rz} fill="url(#renewal-map-water)" stroke="#4e8580" strokeWidth=".85"/>
      <g clipPath="url(#renewal-map-lake)" fill="none" stroke="#d8e8d3" strokeWidth=".38" opacity=".65">
        <ellipse cx={LAKE.x} cy={LAKE.z} rx={LAKE.rx-2} ry={LAKE.rz-2.2}/>
        <path d="M44-38q3-1.1 6 0t6 0m16-5q3-1.1 6 0t6 0M40-8q3-1.1 6 0m29 5q3-1.1 6 0t6 0M52 10q3-1.1 6 0t6 0m12-11h3"/>
      </g>
      <ellipse cx={LAKE.island.x} cy={LAKE.island.z} rx={LAKE.island.rx} ry={LAKE.island.rz} fill="#bccb92" stroke="#e4d7a6" strokeWidth="1.2"/>
      {trees.map(({ x, z, size, dark }) => <use key={`${x},${z}`} href="#renewal-map-tree"
        transform={`translate(${x.toFixed(1)} ${z.toFixed(1)}) scale(${size})`} color={dark ? '#6e9569' : '#89a973'}/>)}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {roads.map(({ points, width }, index) => <polyline key={index} points={points} stroke="#a2946b" strokeOpacity=".48" strokeWidth={width + 1.05}/>)}
        {roads.map(({ points, width }, index) => <polyline key={index} points={points} stroke="#efe0bd" strokeWidth={width}/>)}
      </g>
      <g data-map-landmark="plaza" transform={`translate(${plaza.x} ${plaza.z})`}>
        <circle r="20.6" fill="#e4d3ae" stroke="#a79776" strokeWidth=".55"/>
        <circle r="18.9" fill="none" stroke="#f4e8c8" strokeWidth=".8"/>
        <circle r="13.25" fill="none" stroke="#c5b48f" strokeWidth=".42"/>
        <path d="M-13.25 0h26.5M0-13.25v26.5M-9.37-9.37l18.74 18.74m0-18.74L-9.37 9.37" stroke="#c5b48f" strokeWidth=".42"/>
        <text y="8.5" textAnchor="middle" fontSize="3.8" fill="#584a33" stroke="#efe1be" strokeWidth=".65" paintOrder="stroke">중앙광장</text>
      </g>
      <g strokeLinecap="round">
        <line x1={BRIDGE.x0} x2={BRIDGE.x1} y1={BRIDGE.z} y2={BRIDGE.z} stroke="#6f5944" strokeWidth={BRIDGE.width+1.2}/>
        <line x1={BRIDGE.x0} x2={BRIDGE.x1} y1={BRIDGE.z} y2={BRIDGE.z} stroke="#c8a470" strokeWidth={BRIDGE.width}/>
        <line x1={BRIDGE.x0} x2={BRIDGE.x1} y1={BRIDGE.z} y2={BRIDGE.z} stroke="#846a51" strokeWidth={BRIDGE.width} strokeDasharray=".24 1.2" strokeLinecap="butt"/>
      </g>
      <g transform={`translate(${fountain.x} ${fountain.z})`}>
        <circle r="17.6" fill="#e2cfaa" stroke="#ac986f" strokeWidth=".65"/>
        <circle r="15.45" fill="none" stroke="#f5e7c8" strokeWidth="1.1"/>
        <circle r="9.5" fill="#dce3c7" stroke="#aa9c74" strokeWidth=".65"/>
        <circle r="8.5" fill="url(#renewal-map-water)"/>
        <circle r="5.8" fill="none" stroke="#d4e5ce" strokeWidth=".5" opacity=".85"/>
      </g>
      <ellipse cx={fitness.x} cy={fitness.z} rx="15" ry="11" fill="#d9c59d" stroke="#998769" strokeWidth=".75"/>
      <ellipse cx={fitness.x} cy={fitness.z} rx="12.8" ry="8.8" fill="none" stroke="#f4e4bf" strokeWidth=".9"/>
      <g transform={`translate(${pagoda.x} ${pagoda.z})`}>
        <rect x="-13" y="-13" width="26" height="26" rx="1.4" fill="#d8c6a4" stroke="#a19073" strokeWidth=".75"/>
        <rect x="-10.5" y="-10.5" width="21" height="21" rx=".8" fill="none" stroke="#f4e7ca" strokeWidth="1.1"/>
        <path d="M-9-6h18M-9 6h18M-6-9v18M6-9v18" stroke="#b7a78c" strokeWidth=".43"/>
      </g>
      <g transform={`translate(${tower.x} ${tower.z})`}>
        <circle r="7.7" fill="#d6c6a6" stroke="#9b8972" strokeWidth=".6"/>
        <circle r="5.85" fill="url(#renewal-map-roof)" stroke="#3e5b5b" strokeWidth=".6"/>
        <circle r="4.05" fill="none" stroke="#c1cebc" strokeWidth=".5"/>
      </g>
      {map.jumpCourse && <g data-map-landmark="jumpmap">
        <g transform={`translate(${jump.x} ${jump.z})`}>
          <circle r="8.25" fill="#d9c9a9" stroke="#a29172" strokeWidth=".65"/>
          <circle r="7.55" fill="none" stroke="#efdfbc" strokeWidth=".45"/>
          <polygon points={octagon(3.9)} transform="translate(.45 .65)" fill="#6f6555" opacity=".45"/>
          <polygon points={octagon(3.9)} fill="#a39883" stroke="#6f6657" strokeWidth=".45"/>
          <polygon points={octagon(2.7)} fill="#c8baa0" stroke="#7c705e" strokeWidth=".45"/>
          <polygon points={octagon(1.4)} fill="#e3d5b7" stroke="#9a8a71" strokeWidth=".35"/>
        </g>
        {/* The stone course repeats the same eight positions on three levels. */}
        {map.jumpCourse.pads.slice(0, 8).map(({ id, x, z, halfX, halfZ, yaw }) => <rect key={id}
          x={-halfX} y={-halfZ} width={halfX * 2} height={halfZ * 2} rx=".2"
          transform={`translate(${x} ${z}) rotate(${-yaw * 180 / Math.PI})`}
          fill="#f2e5c7" stroke="#847560" strokeWidth=".4"/>)}
      </g>}
      {map.pavilions.map(({ id, x, z }) => <PavilionRoof key={id} x={x} z={z} radius={id === 'P0' ? 9.4 : 5.8}/>)}
      {buildings.map(({ id, x, z, half: [width, depth], yaw }) => <g key={id}
        transform={`translate(${x} ${z}) rotate(${-yaw * 180 / Math.PI})`}>
        <rect x={-width+.65} y={-depth+1.05} width={width*2} height={depth*2} rx="1.1" fill="#485d4c" opacity=".25"/>
        <path d={`M${-width} ${-depth*.8}L0 ${-depth}L${width} ${-depth*.8}V${depth*.8}L0 ${depth}L${-width} ${depth*.8}Z`}
          fill="url(#renewal-map-roof)" stroke="#3c5957" strokeWidth=".55"/>
        <path d={`M${-width*.83} 0H${width*.83}M0 ${-depth*.85}V${depth*.85}`} stroke="#bac1a2" strokeWidth=".38"/>
      </g>)}
      {map.tables.filter(table => !table.pavilionId).map(table => <circle key={table.id} data-table-id={table.id}
        cx={table.position[0]} cy={table.position[2]} r="1.4" fill="#a48357" stroke="#f0ddac" strokeWidth=".5"/>)}
      {rentals.map(({ id, x, z }) => <use key={id} data-map-rental={id} href="#renewal-map-rental" x={x} y={z}/>)}
    </g>
    <text x={map.world.spawn[0]} y={map.world.spawn[1]+7} textAnchor="middle" fontSize="4.2"
      fill="#344f3e" stroke="#f8f0d7" strokeWidth=".65" paintOrder="stroke">입구</text>
  </g>
})
