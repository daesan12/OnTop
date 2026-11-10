/** Shared with the dev course: low pads are clear, high idle pads remain a faint guide. */
export function targetFade(top: number, feet: number, running: boolean, occupied: boolean, occluded: boolean) {
  let fade = 1
  if (top >= 15) {
    const dy = top - feet, outside = dy > 12 ? dy - 12 : dy < -8 ? -8 - dy : 0
    fade = running ? Math.max(.15, 1 - outside / 4) : .15
    if (occupied) fade = Math.max(fade, .6)
  }
  return occluded ? Math.min(fade, .25) : fade
}

/** The new descending stages stay faint while idle, even below dev's height threshold. */
export function coursePadFade(stage: number, top: number, feet: number, running: boolean, occupied: boolean, occluded: boolean) {
  const fade = targetFade(top, feet, running, occupied, occluded)
  return !running && stage > 0 ? Math.min(.15, fade) : fade
}

/** Ordered screen-door fade avoids transparent instance sorting, exactly as on dev. */
export function applyJumpFadeShader(shader: {vertexShader: string; fragmentShader: string}) {
  shader.vertexShader = `attribute float aFade; varying float vFade;\n${shader.vertexShader}`
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n vFade=aFade;`)
  shader.fragmentShader = `varying float vFade;\n${shader.fragmentShader}`
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    vec2 px=mod(floor(gl_FragCoord.xy),4.);
    float b2=mod(2.*mod(px.x,2.)+3.*mod(px.y,2.),4.);
    float b4=mod(2.*floor(px.x/2.)+3.*floor(px.y/2.),4.);
    if(vFade<.995 && vFade<=(4.*b2+b4+.5)/16.)discard;
  `)
}
