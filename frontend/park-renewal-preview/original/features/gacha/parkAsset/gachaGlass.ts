import {CatmullRomCurve3,LatheGeometry,Vector2,Vector3} from 'three'

// Smooth meridian instead of seven flat bands. The ends still meet the existing gold hoops.
const meridian=new CatmullRomCurve3([[1.35,2.06],[1.49,2.27],[1.63,2.69],[1.66,3.24],[1.61,3.76],[1.47,4.17],[1.35,4.42]].map(([r,y])=>new Vector3(r,y,0)),false,'centripetal')
export const gachaGlassGeometry=new LatheGeometry(meridian.getPoints(32).map(p=>new Vector2(p.x,p.y)),64)
export const glassVertex=`
 varying vec3 glassNormal;
 varying vec3 glassPosition;
 void main(){
  vec4 world=modelMatrix*vec4(position,1.0);
  glassPosition=world.xyz;
  glassNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*world;
 }`
// Broad sky reflection and a stronger grazing-angle edge work without an HDR environment.
// No refraction pass: the capsules stay clear and this uses one transparent draw call.
export const glassFragment=`
 varying vec3 glassNormal;
 varying vec3 glassPosition;
 void main(){
  vec3 n=normalize(glassNormal),v=normalize(cameraPosition-glassPosition);
  float rim=pow(1.0-clamp(dot(n,v),0.0,1.0),2.2);
  vec3 reflected=reflect(-v,n);
  float windowLight=pow(max(dot(normalize(vec3(reflected.x,0.0,reflected.z)),normalize(vec3(-.62,0.0,.78))),0.0),72.0);
  windowLight*=smoothstep(-.35,.1,reflected.y)*(1.0-smoothstep(.8,1.0,reflected.y));
  float sky=pow(max(reflected.y,0.0),3.0);
  vec3 facing=normalize((viewMatrix*vec4(n,0.0)).xyz);
  float crescent=exp(-pow((facing.x+.55)/.075,2.0))*smoothstep(-.2,.0,facing.y)*(1.0-smoothstep(.65,.8,facing.y));
  float shortGlint=exp(-pow((facing.x-.72)/.045,2.0))*smoothstep(-.6,-.4,facing.y)*(1.0-smoothstep(.0,.2,facing.y));
  float highlight=(crescent+shortGlint*.55)*smoothstep(.15,.4,facing.z);
  vec3 color=mix(vec3(.47,.72,.74),vec3(.96,.99,1.0),clamp(rim*.8+windowLight+sky*.3+highlight,0.0,1.0));
  gl_FragColor=vec4(color,.055+.6*rim+.32*windowLight+.07*sky+.6*highlight);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`
