export type V3=readonly[number,number,number]
export type MappingStatus='mapped'|'construction'|'unplaced'
export interface Pose {x:number;y:number;z:number;yaw:number}
export interface MappedSeat {seatIndex:number;use:Pose;exit:Pose;contactY:number;presented:boolean}
export interface MappedAnchor {
 key:string;id:string;kind:string;label:string;source:V3;siteId:string|null;status:MappingStatus;position:V3|null;yaw:number;scale:V3;
 reach?:Pose;radius?:number;heightTolerance?:number;seats?:MappedSeat[];use?:Pose;exit?:Pose;surfaceY?:number;floorY?:number;
 assetId?:string;reason?:string;camera?:{look:V3;position:V3};pavilionId?:string
}
export const pose=(p:V3,yaw=0):Pose=>({x:p[0],y:p[1],z:p[2],yaw})
/** Three.js positive Y rotation, including the local +Z entrance direction. */
export function transform(p:V3,origin:V3,yaw=0,scale:V3=[1,1,1]):V3{
 const x=p[0]*scale[0],z=p[2]*scale[2],c=Math.cos(yaw),s=Math.sin(yaw)
 return[origin[0]+c*x+s*z,origin[1]+p[1]*scale[1],origin[2]-s*x+c*z]
}
export function transformPose(p:Pose,origin:V3,yaw=0):Pose{return pose(transform([p.x,p.y,p.z],origin,yaw),p.yaw+yaw)}
