import { Component, memo, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { CanvasTexture, MeshStandardMaterial, OrthographicCamera, SRGBColorSpace } from 'three'
import { ChessPiece3D, createChessPieceGeometry } from './ChessPiece3D'

const labels: Record<string, string> = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' }
const coord = (index: number) => `${'abcdefgh'[index % 8]}${1 + Math.floor(index / 8)}`
type Props = {
  board: string; blackView: boolean; selected: string; destinations: string[]; lastMove?: string
  pings: number[]; disabled: boolean; onSquare(index: number): void
}

function BoardCamera({ overhead, angle }: { overhead: boolean; angle: number }) {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return
    camera.position.set(0, overhead ? 16 : 13, overhead ? .001 : 10)
    camera.lookAt(0, .25, 0)
    const span = Math.max(10.3, 9.3 * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))) + .5)
    camera.zoom = Math.min(size.width, size.height) / span
    camera.updateProjectionMatrix(); invalidate()
  }, [camera, size.width, size.height, overhead, angle, invalidate])
  return null
}

function BoardLetters() {
  const atlas = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f6dfae'; context.font = 'bold 46px Georgia'; context.textAlign = 'center'; context.textBaseline = 'middle'
    for (let i = 0; i < 16; i++) context.fillText('abcdefgh12345678'[i], i * 64 + 32, 32)
    const textures = Array.from({ length: 16 }, (_, i) => {
      const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace
      texture.repeat.set(1 / 16, 1); texture.offset.x = i / 16
      return texture
    })
    return textures
  }, [])
  useEffect(() => () => atlas.forEach(texture => texture.dispose()), [atlas])
  return <>{Array.from({ length: 8 }, (_, i) => <group key={i}>
    {[false, true].map(opposite => <group key={String(opposite)} rotation-y={opposite ? Math.PI : 0}>
      <mesh position={[opposite ? 3.5 - i : i - 3.5, .019, 4.24]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.3, .3]} /><meshBasicMaterial map={atlas[i]} transparent depthWrite={false} />
      </mesh>
      <mesh position={[-4.24, .019, opposite ? i - 3.5 : 3.5 - i]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.3, .3]} /><meshBasicMaterial map={atlas[8 + i]} transparent depthWrite={false} />
      </mesh>
    </group>)}
  </group>)}</>
}

function Scene({ board, blackView, selected, destinations, lastMove, pings, disabled, onSquare, angle }: Props & { angle: number }) {
  const resources = useMemo(() => ({ geometry: createChessPieceGeometry(),
    white: new MeshStandardMaterial({ color: '#f0dfbb', roughness: .29, metalness: .12 }),
    black: new MeshStandardMaterial({ color: '#51301f', roughness: .31, metalness: .14 }),
    gold: new MeshStandardMaterial({ color: '#af8847', roughness: .38, metalness: .55 }),
  }), [])
  useEffect(() => () => {
    Object.values(resources.geometry.bodies).forEach(geometry => geometry.dispose())
    resources.geometry.horse.dispose(); resources.geometry.mitre.dispose()
    resources.white.dispose(); resources.black.dispose(); resources.gold.dispose()
  }, [resources])
  return <group rotation-y={(blackView ? Math.PI : 0) + angle}>
    <mesh position={[0, -.24, 0]} receiveShadow><boxGeometry args={[8.9, .12, 8.9]} /><meshStandardMaterial color="#b69251" roughness={.5} /></mesh>
    <mesh position={[0, -.12, 0]} receiveShadow><boxGeometry args={[8.8, .24, 8.8]} /><meshStandardMaterial color="#53351e" roughness={.38} /></mesh>
    <BoardLetters />
    {Array.from(board, (piece, index) => {
      const square = coord(index), target = destinations.includes(square), chosen = selected === square
      const recent = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square
      const ping = pings.includes(index), light = (index % 8 + Math.floor(index / 8)) % 2 === 1
      return <group key={square} name={`square-${square}`} position={[index % 8 - 3.5, .025, 3.5 - Math.floor(index / 8)]}
        onClick={event => { event.stopPropagation(); if (event.button === 0 && event.delta < 8 && !disabled) onSquare(index) }}>
        <mesh receiveShadow><boxGeometry args={[.998, .05, .998]} /><meshStandardMaterial roughness={.56}
          color={chosen ? '#639265' : recent ? light ? '#dbc784' : '#a59852' : light ? '#ead2a8' : '#a3744c'} /></mesh>
        {piece !== '.' && <group position={[0, .026, 0]}><ChessPiece3D piece={piece} geometry={resources.geometry}
          material={piece === piece.toUpperCase() ? resources.white : resources.black} detail={resources.gold} /></group>}
        {(target || ping || chosen) && <mesh position={[0, .059, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[target && piece === '.' ? .08 : .38, target && piece === '.' ? .145 : .45, 40]} />
          <meshBasicMaterial color={ping ? '#238fae' : '#164c32'} />
        </mesh>}
      </group>
    })}
  </group>
}

class BoardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p className="chess-webgl-error" role="alert">3D 화면을 열지 못했습니다. 아래 ‘키보드로 칸 선택’으로 대국을 이어갈 수 있습니다.</p> : this.props.children }
}

/** A separate game canvas: no park camera, map geometry or world coordinates are modified. */
export const ChessBoard3D = memo(function ChessBoard3D(props: Props) {
  const [angle, setAngle] = useState(0), [overhead, setOverhead] = useState(false)
  const visible = Array.from({ length: 64 }, (_, i) => props.blackView ? Math.floor(i / 8) * 8 + 7 - i % 8 : (7 - Math.floor(i / 8)) * 8 + i % 8)
  return <div className="chess-board-wrap">
    <div className="chess-board-3d" role="group" aria-label="3D 체스판 8 곱하기 8" data-view={overhead ? 'overhead' : 'angled'} data-angle={angle}>
      <BoardBoundary><Canvas orthographic shadows frameloop="demand" dpr={[1, 1.5]} camera={{ near: .1, far: 60 }}
        gl={{ antialias: true, alpha: true }} fallback={<p role="alert">WebGL을 사용할 수 없습니다. 아래 칸 선택으로 대국을 이어가세요.</p>}>
        <BoardCamera overhead={overhead} angle={angle} />
        <hemisphereLight args={['#fff6e6', '#6c715b', 2.1]} />
        <directionalLight position={[-3, 9, 5]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6}
          shadow-normalBias={.025} shadow-bias={-.0002} shadow-radius={3} />
        <directionalLight position={[4, 6, -5]} intensity={1.2} color="#fff0d0" />
        <Scene {...props} angle={angle} />
      </Canvas></BoardBoundary>
    </div>
    <div className="chess-view-tools" aria-label="체스판 시점">
      <button type="button" aria-label="시점 왼쪽으로 회전" onClick={() => setAngle(value => value - Math.PI / 12)}>↶</button>
      <button type="button" aria-pressed={overhead} onClick={() => setOverhead(value => !value)}>{overhead ? '입체 시점' : '위에서 보기'}</button>
      <button type="button" onClick={() => { setAngle(0); setOverhead(false) }}>기본 시점</button>
      <button type="button" aria-label="시점 오른쪽으로 회전" onClick={() => setAngle(value => value + Math.PI / 12)}>↷</button>
    </div>
    <p className="chess-board-hint">기물과 이동할 칸을 차례로 누르세요.</p>
    <details className="chess-keyboard-board"><summary>키보드로 칸 선택</summary>
      <div className="chess-board" role="group" aria-label="체스판 칸 선택">{visible.map(index => {
        const piece = props.board[index], square = coord(index), target = props.destinations.includes(square)
        return <button key={square} type="button" className={`chess-square${props.selected === square ? ' selected' : ''}${target ? ' legal' : ''}`}
          aria-label={`${square} ${piece === '.' ? '빈 칸' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}${target ? ' 이동 가능' : ''}`}
          aria-pressed={props.selected === square} aria-disabled={props.disabled} onClick={() => { if (!props.disabled) props.onSquare(index) }}>
          <strong>{square}</strong><small>{piece === '.' ? '·' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}</small>
        </button>
      })}</div>
    </details>
  </div>
})
