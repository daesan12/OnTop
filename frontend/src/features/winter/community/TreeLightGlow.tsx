import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, type Vector3 } from 'three'
import { TREE_WARM_WHITE } from './treeLighting'

/** One depth-tested draw for all bulbs and the topper, without a park-wide bloom pass. */
export function TreeLightGlow({ bulbs, star }: { bulbs: readonly Vector3[]; star: Vector3 | null }) {
  const height = useThree(s => s.size.height), dpr = useThree(s => s.viewport.dpr)
  const geometry = useMemo(() => {
    const points = star ? [...bulbs, star] : bulbs
    return new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(points.flatMap(p => p.toArray()), 3))
      .setAttribute('diameter', new Float32BufferAttribute(points.map((_, i) => i < bulbs.length ? .7 : 2.6), 1))
  }, [bulbs, star])
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    uniforms: { viewportHeight: { value: 1 }, warmWhite: { value: new Color(TREE_WARM_WHITE) } },
    vertexShader: `attribute float diameter; uniform float viewportHeight; varying float starLight;
      void main() {
        starLight = step(1.0, diameter);
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        // Keep the glow in front of its own bulb glass and the star's woven housing.
        // Depth testing still lets the tree and nearby buildings hide lights behind them.
        view.z += min(diameter * .3 * length(modelMatrix[0].xyz), .4);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(diameter * length(modelMatrix[0].xyz) * projectionMatrix[1][1]
          * viewportHeight * .5 / max(.1, -view.z), 1.0, 180.0);
      }`,
    fragmentShader: `uniform vec3 warmWhite; varying float starLight;
      void main() {
        vec2 p = (gl_PointCoord - .5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;
        float halo = exp(-r * r * 5.0) * .55;
        float core = exp(-r * r * 75.0) * .7 * (1.0 - starLight);
        float rays = (exp(-abs(p.x) * 55.0) + exp(-abs(p.y) * 55.0))
          * pow(1.0 - r, 2.0) * .2;
        gl_FragColor = vec4(warmWhite, (halo + core + rays) * (1.0 - smoothstep(.75, 1.0, r)));
        #include <colorspace_fragment>
      }`,
  }), [])
  material.uniforms.viewportHeight!.value = height * dpr
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <points name="winter-tree-warm-white-glow" geometry={geometry} material={material}
    dispose={null} raycast={() => {}} />
}
