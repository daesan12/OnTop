import {Box3,Vector3,type Object3D} from 'three'
/** Mirror only the relief arrow; keep the Korean label and approved source geometry intact. */
export function reverseSteleArrow(root:Object3D){const arrow=root.getObjectByName('stele-arrow');if(!arrow)return root;const center=new Box3().setFromObject(arrow).getCenter(new Vector3());arrow.parent?.worldToLocal(center);arrow.scale.x*=-1;arrow.position.x=2*center.x-arrow.position.x;return root}
