import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { GeneratedParkMapBackground } from './GeneratedParkMapBackground'
import { memo } from 'react';
import { WORLD, PARK_SIZE, PARK_ROUTES, PARK_ENTRANCE, LAKE, LAKE_WALK, BRIDGE, STEPPING_STONES,
  TREE_PLANTINGS, GARDEN_TREES, WILLOW_TREES, FOUNTAIN, VR_ZONE, FITNESS_AREA, BENCHES, PARK_PAVILIONS, TABLES } from '../../config';
/** Static reference map: no raster downloads, textures, 3D assets or per-tick reconciliation. */
const LegacyParkMapBackground = memo(function ParkMapBackground() {
  return <g aria-hidden="true" className="park-map-background">
            <rect
              x={-WORLD.halfSize}
              y={-WORLD.halfSize}
              width={PARK_SIZE}
              height={PARK_SIZE}
              rx={3}
              fill="#bdcea0"
              stroke="#72866b"
              strokeWidth={3}
            />
            {PARK_ROUTES.map(route => (
              <polyline key={route.id} className="map-walkway" points={route.points.map(p=>p.join(",")).join(" ")}
                fill="none" stroke="#e5dfc9" strokeWidth={route.width} strokeLinejoin="round" />
            ))}
            <ellipse
              cx={LAKE.x}
              cy={LAKE.z}
              rx={LAKE.radiusX + LAKE_WALK.offset}
              ry={LAKE.radiusZ + LAKE_WALK.offset}
              fill="none"
              stroke="#e5dfc9"
              strokeWidth={LAKE_WALK.width}
            />
            <text
              x={0}
              y={PARK_ENTRANCE.gateZ + 5}
              textAnchor="middle"
              fontSize={5}
              fill="#25483b"
            >
              입구
            </text>
            <ellipse
              cx={LAKE.x}
              cy={LAKE.z}
              rx={LAKE.radiusX}
              ry={LAKE.radiusZ}
              fill="#6a9c9a"
            />
            <line
              x1={BRIDGE.startX}
              y1={BRIDGE.z}
              x2={BRIDGE.endX}
              y2={BRIDGE.z}
              stroke="#997e59"
              strokeWidth={4}
            />
            {STEPPING_STONES.map((s, i) => (
              <rect
                key={i}
                x={s.x - s.width / 2}
                y={s.z - s.depth / 2}
                width={s.width}
                height={s.depth}
                fill="#e2ddca"
              />
            ))}
            {TREE_PLANTINGS.map((t, i) => (
              <circle
                key={i}
                cx={t.position[0]}
                cy={t.position[2]}
                r={1.3}
                fill="#71945b"
              />
            ))}
            {GARDEN_TREES.map((t, i) => (
              <circle
                key={"new-tree-" + i}
                cx={t.x}
                cy={t.z}
                r={1.6}
                fill={
                  t.kind === "maple"
                    ? "#a75e47"
                    : t.kind === "pink-cherry"
                      ? "#e4a2b6"
                      : "#eee4cf"
                }
              />
            ))}
            {WILLOW_TREES.map((t, i) => (
              <circle key={i} cx={t[0]} cy={t[2]} r={2} fill="#5d8145" />
            ))}
            <circle
              cx={FOUNTAIN.x}
              cy={FOUNTAIN.z}
              r={FOUNTAIN.plazaRadius}
              fill="#dcd5c0"
            />
            <circle
              cx={FOUNTAIN.x}
              cy={FOUNTAIN.z}
              r={FOUNTAIN.radius}
              fill="#6a9c9a"
            />
            <rect
              x={VR_ZONE.x - VR_ZONE.width / 2}
              y={VR_ZONE.z - VR_ZONE.depth / 2}
              width={VR_ZONE.width}
              height={VR_ZONE.depth}
              fill="#8caeb3"
              opacity={0.7}
            />
            <rect
              x={FITNESS_AREA.x - FITNESS_AREA.width / 2}
              y={FITNESS_AREA.z - FITNESS_AREA.depth / 2}
              width={FITNESS_AREA.width}
              height={FITNESS_AREA.depth}
              fill="#a8b49a"
            />
            {BENCHES.map((b, i) => (
              <circle key={i} cx={b[0]} cy={b[2]} r={0.9} fill="#785c3e" />
            ))}
            {PARK_PAVILIONS.map((p) => (
              <rect
                key={p.id}
                x={p.x - 4.5 * p.scale}
                y={p.z - 4.5 * p.scale}
                width={9 * p.scale}
                height={9 * p.scale}
                fill="#845b3c"
              />
            ))}
{TABLES.map(t=><circle key={t.id} cx={t.position[0]} cy={t.position[2]} r={0.9} fill="#f6d790" />)}
  </g>;
});

export const ParkMapBackground=GENERATED_PARK_ENABLED?GeneratedParkMapBackground:LegacyParkMapBackground
