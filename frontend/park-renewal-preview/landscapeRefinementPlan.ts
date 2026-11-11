export const REMOVED_POCKET={x:-13.3,z:-8.35,rx:3.4,rz:3.5}
export const HUB_TREE_ISLAND={x:13.8,z:18.9,rx:2.7,rz:3.7}
export const WEST_REST_ROW={bench:[-36.5,49.5]as const,lamp:[-33.1,49.5]as const,rental:[-27.5,49.5]as const}
export const inEllipse=(x:number,z:number,e:{x:number;z:number;rx:number;rz:number})=>((x-e.x)/e.rx)**2+((z-e.z)/e.rz)**2<1

export const SOUTH_CLUSTER_GROVE={x:21.8,z:54.8,rx:4.2,rz:3.1}

export const FOLK_FRONT_GROVE={x:-54.5,z:65.3,rx:4.8,rz:3.6}
export const SUMMIT_LAMP_ANCHORS=[[-16.7,-97.8],[18.4,-97.7],[-54,-50.2],[-53,-90.5]]as const
export const CAFE_CURVE={x:15,z:-21,rx:11.3,rz:15}
