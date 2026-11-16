import * as THREE from 'three';
function canvas(width,height) {const el=document.createElement('canvas');el.width=width;el.height=height;const c=el.getContext('2d');if(!c)throw Error('Canvas 2D unavailable');return [el,c];}
function texture(el,name) {const tex=new THREE.CanvasTexture(el);tex.colorSpace=THREE.SRGBColorSpace;tex.name=name;tex.anisotropy=4;return tex;}
function battery(c) {
  c.strokeRect(49,48,177,96);c.fillRect(228,77,18,38);
  c.fillStyle='#b6dfb2';c.beginPath();c.moveTo(126,57);c.lineTo(160,57);c.lineTo(139,91);c.lineTo(169,91);c.lineTo(112,139);c.lineTo(126,105);c.lineTo(99,105);c.closePath();c.fill();
}
export function createRentalSignTexture(kind='bicycle') {
  if(!['bicycle','scooter'].includes(kind))throw new RangeError('Invalid rental sign kind');
  const [el,c]=canvas(1280,184);c.fillStyle='#765033';c.fillRect(0,0,1280,184);c.strokeStyle='#f4e4bc';c.lineWidth=10;c.lineCap='round';c.lineJoin='round';
  c.save();c.translate(10,0);battery(c);c.restore();
  c.fillStyle='#b6dfb2';c.beginPath();c.moveTo(275,40);c.lineTo(304,40);c.lineTo(286,80);c.lineTo(310,80);c.lineTo(270,140);c.lineTo(283,96);c.lineTo(262,96);c.closePath();c.fill();
  c.fillStyle='#f4e4bc';c.font='bold 88px "Malgun Gothic",sans-serif';c.textBaseline='middle';c.textAlign='center';c.fillText(kind==='bicycle'?'자전거 대여소':'킥보드 대여소',800,101);
  return texture(el,`${kind}-rental-sign-procedural`);
}
export function createRentalBannerTexture() {
  const [el,c]=canvas(384,1008);c.clearRect(0,0,384,1008);c.fillStyle='#eddbb2';c.textAlign='center';c.textBaseline='middle';
  c.font='bold 118px "Malgun Gothic",sans-serif';c.fillText('온탑',192,493);c.font='bold 99px "Malgun Gothic",sans-serif';c.fillText('대여소',192,657);
  c.beginPath();c.moveTo(40,295);c.quadraticCurveTo(120,275,154,221);c.lineTo(230,221);c.quadraticCurveTo(264,275,344,295);c.lineTo(320,323);c.lineTo(64,323);c.closePath();c.fill();
  c.fillRect(120,315,144,37);c.beginPath();c.moveTo(80,215);c.quadraticCurveTo(139,200,165,155);c.lineTo(219,155);c.quadraticCurveTo(245,200,304,215);c.lineTo(287,237);c.lineTo(97,237);c.closePath();c.fill();c.fillRect(141,231,102,29);
  c.beginPath();c.moveTo(119,143);c.quadraticCurveTo(162,130,179,98);c.lineTo(205,98);c.quadraticCurveTo(222,130,265,143);c.lineTo(253,163);c.lineTo(131,163);c.closePath();c.fill();c.fillRect(184,77,16,30);
  return texture(el,'rental-marker-procedural');
}
