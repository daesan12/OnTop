import { THREE, Builder, assertOptions, assetHandle, anchor, pagoda } from './primitives.js';
import { softBox, wheel, fender } from './details.js';

/** Static city bicycle. No riding, steering, physics or wheel animation. */
export function createBicycle(options = {}) {
  const {scale=1,quality='balanced',cream='#e7d3a3',red='#b8493b',castShadow=true}=options;
  assertOptions({scale,quality}); const b = new Builder(quality);
  wheel(b,-0.64,0.35,0.115,true); wheel(b,0.68,0.35,0.115,true);
  fender(b,-0.64,0.35,red,0.135); fender(b,0.68,0.35,red,0.135);
  const tubes = [
    [[0,0.35,-0.64],[0,0.39,-0.12],[0,0.85,-0.36]],
    [[0,0.85,-0.36],[0,0.56,-0.12],[0,0.5,0.28],[0,0.94,0.47]],
    [[0,0.39,-0.12],[0,0.44,0.18],[0,0.9,0.45]],
    [[0,0.35,-0.64],[0,0.85,-0.36]],
  ];
  for(const points of tubes) b.curve('paint',cream,points,0.035,quality==='light'?7:12,6);
  // Closed head tube, fork crown and through-axles join the two fork legs to the frame.
  b.beam('paint',cream,[0,.84,.49],[0,.96,.455],.075);
  b.beam('paint',cream,[-.085,.86,.491],[.085,.86,.491],.055);
  for(const z of [-.64,.68]) b.cylinder('metal','#949586',[0,.35,z],.027,.027,.19,[0,0,Math.PI/2],10);
  for(const x of [-0.075,0.075]) {
    b.beam('paint',cream,[x,0.89,0.48],[x,0.35,0.68],0.035);
    b.beam('metal','#a4a18d',[x,0.35,-0.64],[x*.7,0.64,-0.85],0.012);
    b.beam('metal','#a4a18d',[x,0.35,0.68],[x*.7,0.64,0.89],0.012);
  }
  b.beam('paint',cream,[0,.39,-.12],[0,.85,-.36],.065);
  b.beam('metal','#b2af9b',[0,0.79,-0.34],[0,0.98,-0.43],0.035);
  softBox(b,'wood','#9a613a',[0,1.01,-0.43],[0.29,0.115,0.34],0.07);
  b.curve('metal','#a5a697',[[0,0.91,0.47],[0,1.07,0.43],[0,1.1,0.47]],0.025,8,6);
  b.curve('metal','#a5a697',[[-0.34,1.21,0.4],[-0.21,1.19,0.4],[-0.13,1.1,0.46],[0,1.1,0.47],[0.13,1.1,0.46],[0.21,1.19,0.4],[0.34,1.21,0.4]],0.022,24,6);
  for(const sign of [-1,1]) {
    b.cylinder('wood','#905834',[sign * 0.29,1.21,0.4],0.034,0.034,0.16,[0,0,Math.PI / 2],10);
    b.ball('metal','#797d74',[sign*.22,1.195,.409],[.024,.022,.025]);
    b.curve('metal','#797d74',[[sign*.22,1.195,.409],[sign*.21,1.15,.49],[sign*.3,1.15,.49]],.009,7,5);
    b.curve('rubber','#484a43',[[sign*.22,1.18,.428],[sign*.16,1.01,.64],[sign*.065,.69,.55]],.007,12,4);
    b.beam('metal','#898d80',[sign*.065,.69,.55],[sign*.075,.66,.565],.018);
    // Basket rack ties directly into the fork, rather than ending in empty space.
    b.curve('metal','#979b8a',[[sign*.075,.35,.68],[sign*.13,.76,.85],[sign*.18,.858,.93]],.013,8,5);
    b.beam('metal','#979b8a',[sign*.075,.87,.48],[sign*.18,.858,.73],.022);
  }
  b.beam('metal','#929787',[-.16,1.115,.45],[-.16,1.165,.45],.023);
  b.ball('metal','#b5a275',[-.16,1.173,.45],[.026,.022,.026]);
  // Open wicker basket with woven slats and a separate cream pagoda plaque.
  softBox(b,'wood','#b7864b',[0,0.87,0.84],[0.45,0.035,0.35],0.03);
  for(const side of [-1,1]) {
    for(let i=0;i<8;i++) b.box('wood',i%2?'#bd8c50':'#c99759',[(i-3.5)*0.055,1.01,0.84+side*0.177],[0.047,0.25,0.026]);
    for(let i=0;i<5;i++) b.box('wood',i%2?'#bd8c50':'#c99759',[side*0.226,1.01,0.84+(i-2)*0.065],[0.026,0.25,0.058]);
    for(let row=0;row<4;row++) {
      b.box('wood','#a8773f',[0,0.925+row*0.052,0.84+side*0.195],[0.46,0.018,0.018]);
      b.box('wood','#a8773f',[side*0.244,0.925+row*0.052,0.84],[0.018,0.018,0.36]);
    }
    softBox(b,'wood','#a7753d',[0,1.145,0.84+side*0.19],[0.5,0.04,0.04],0.01);
    softBox(b,'wood','#a7753d',[side*0.24,1.145,0.84],[0.04,0.04,0.39],0.01);
  }
  softBox(b,'paint','#ecd5a4',[0,1.015,1.053],[0.26,0.185,0.023],0.018);
  pagoda(b,'#825738',[0,0.995,1.066],0.1);
  b.beam('metal','#a19d88',[-.18,.855,.82],[.18,.855,.82],.022);
  // Chain guard, pedals, lamp, reflector and a static display kickstand.
  softBox(b,'paint',cream,[0.105,0.39,-0.35],[0.06,0.19,0.58],0.07);
  b.cylinder('metal','#929184',[0,.39,-.12],.047,.047,.335,[0,0,Math.PI/2],12);
  b.beam('metal','#8d8c7c',[0,.38,-.29],[.085,.38,-.29],.035);
  b.cylinder('metal','#837c67',[0.145,0.39,-0.12],0.065,0.065,0.025,[0,0,Math.PI / 2],16);
  for(const side of [-1,1]) {
    const end = [side*0.18,0.39-side*0.12,-0.12+side*0.1];
    b.beam('metal','#8e8f81',[side*0.16,0.39,-0.12],end,0.018);
    softBox(b,'rubber','#45463f',[side*0.25,end[1],end[2]],[0.17,0.035,0.1],0.01);
  }
  b.at([0.143,0.365,-0.44],[0,Math.PI / 2,0],()=>pagoda(b,'#ad5c3d',[0,0,0],0.07));
  b.beam('metal','#858b7b',[0,.86,.491],[0,.81,.65],.023);
  softBox(b,'metal','#858b7b',[0,.82,.65],[.12,.09,.07],.025);
  softBox(b,'glow','#ffe5a0',[0,.82,.692],[.086,.06,.018],.012);
  softBox(b,'paint',red,[0,0.625,-0.91],[0.085,0.065,0.025],0.014);
  b.beam('metal','#8d8c7c',[0.08,0.38,-0.29],[0.23,0.025,-0.43],0.018);
  softBox(b,'rubber','#494b41',[0.23,0.018,-0.43],[0.1,0.025,0.075],0.01);
  const group=b.finish('korean-city-bicycle',castShadow); group.scale.setScalar(scale);
  const anchors={seat:anchor(group,'bicycle-seat',[0,1.07,-0.43]),gripLeft:anchor(group,'bicycle-left-grip',[-0.29,1.21,0.4]),gripRight:anchor(group,'bicycle-right-grip',[0.29,1.21,0.4]),frontWheel:anchor(group,'bicycle-front-wheel',[0,0.35,0.68]),rearWheel:anchor(group,'bicycle-rear-wheel',[0,0.35,-0.64])};
  group.userData={assetId:'park/korean-bicycle',version:'1.1.0',quality,visualOnly:true,physics:false};
  return assetHandle(group,anchors);
}

/** Static electric kick scooter. All geometry is baked; no vehicle controller. */
export function createScooter(options={}) {
  const {scale=1,quality='balanced',cream='#e7d3a3',red='#b8493b',castShadow=true}=options;
  assertOptions({scale,quality}); const b=new Builder(quality);
  wheel(b,-0.53,0.155,0.1,false); wheel(b,0.53,0.155,0.1,false);
  fender(b,-0.53,0.155,red,0.12); fender(b,0.53,0.155,red,0.12);
  softBox(b,'paint',cream,[0,0.19,-0.03],[0.2,0.095,0.88],0.07);
  softBox(b,'rubber','#4b4d48',[0,0.246,-0.05],[0.16,0.016,0.66],0.025);
  for(let i=0;i<8;i++) b.box('rubber','#66675d',[0,0.257,-0.31+i*0.073],[0.145,0.004,0.007]);
  for(const x of [-0.06,0.06]) {
    b.beam('paint',cream,[x,0.19,-0.43],[x,0.155,-0.53],0.04);
    b.beam('paint',cream,[x,0.155,0.53],[x,0.4,0.49],0.034);
  }
  b.beam('paint',cream,[-.07,.395,.49],[.07,.395,.49],.045);
  for(const z of [-.53,.53]) b.cylinder('metal','#949586',[0,.155,z],.025,.025,.16,[0,0,Math.PI/2],10);
  b.curve('paint',cream,[[0,0.19,0.33],[0,0.29,0.43],[0,0.46,0.48]],0.045,8,6);
  b.beam('metal','#7a7c73',[0,0.35,0.51],[0,1.21,0.32],0.065);
  b.beam('paint',cream,[0,0.49,0.48],[0,1.18,0.327],0.052);
  softBox(b,'rubber','#42443f',[0,0.5,0.475],[0.14,0.17,0.13],0.025,[-0.22,0,0]);
  b.cylinder('paint',red,[0,0.51,0.56],0.034,0.034,0.02,[Math.PI/2,0,0],12);
  // A solid sleeve follows the mast angle and supports the emblem and front light.
  softBox(b,'paint',cream,[0,.76,.42],[.13,.28,.085],.02,[-.22,0,0]);
  b.at([0,.742,.481],[-.22,0,0],()=>pagoda(b,'#a9533b',[0,0,0],.09));
  b.cylinder('rubber','#3d403d',[0,1.235,0.315],0.035,0.035,0.54,[0,0,Math.PI/2],12);
  for(const side of [-1,1]) {
    b.ring('rubber','#63665d',[side*0.22,1.235,0.315],0.037,0.006,[0,Math.PI/2,0],12);
    b.curve('metal','#7a7d73',[[side*0.14,1.24,0.335],[side*0.17,1.2,0.38],[side*0.23,1.2,0.38]],0.008,7,4);
  }
  softBox(b,'rubber','#45453e',[0,1.235,0.315],[0.15,0.1,0.12],0.025);
  softBox(b,'paint',red,[0,1.245,0.383],[0.095,0.073,0.02],0.018);
  softBox(b,'glow','#ffe7b4',[0,1.245,0.397],[0.057,0.037,0.014],0.01);
  softBox(b,'rubber','#45483f',[0,1.08,.372],[.065,.125,.04],.013,[-.22,0,0]);
  softBox(b,'glow','#f5d286',[0,1.08,.396],[.038,.1,.018],.013,[-.22,0,0]);
  softBox(b,'paint',red,[0,0.29,-0.65],[0.075,0.05,0.025],0.01);
  for(const side of [-1,1]) b.cylinder('paint',red,[side*0.065,0.155,-0.53],0.038,0.038,0.02,[0,0,Math.PI/2],12);
  b.beam('metal','#75786d',[0.06,0.19,-0.16],[0.15,0.025,-0.22],0.014);
  const group=b.finish('korean-electric-scooter',castShadow); group.scale.setScalar(scale);
  const anchors={deck:anchor(group,'scooter-deck',[0,0.259,-0.05]),gripLeft:anchor(group,'scooter-left-grip',[-0.22,1.235,0.315]),gripRight:anchor(group,'scooter-right-grip',[0.22,1.235,0.315]),frontWheel:anchor(group,'scooter-front-wheel',[0,0.155,0.53]),rearWheel:anchor(group,'scooter-rear-wheel',[0,0.155,-0.53])};
  group.userData={assetId:'park/korean-scooter',version:'1.1.0',quality,visualOnly:true,physics:false};
  return assetHandle(group,anchors);
}
