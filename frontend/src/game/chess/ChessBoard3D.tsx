import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Group } from 'three'
import { ChessPiece3D, createChessPieceGeometry } from './ChessPiece3D'

const labels: Record<string, string> = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' }
const coord = (index: number) => `${'abcdefgh'[index % 8]}${1 + Math.floor(index / 8)}`
export type ChessBoardProps = {
  board: string; blackView: boolean; selected: string; destinations: string[]; lastMove?: string
  pings: number[]; disabled: boolean; onSquare?(index: number): void
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

export function ChessBoardScene({ board, blackView, selected, destinations, lastMove, pings, disabled, onSquare, angle = 0, layer = 0 }: ChessBoardProps & { angle?: number; layer?: number }) {
  const root = useRef<Group>(null)
  useLayoutEffect(() => { root.current?.traverse(object => { object.layers.set(0); if (layer) object.layers.enable(layer) }) })
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
  return <group ref={root} rotation-y={(blackView ? Math.PI : 0) + angle}>
    <mesh position={[0, -.24, 0]} receiveShadow><boxGeometry args={[8.9, .12, 8.9]} /><meshStandardMaterial color="#b69251" roughness={.5} /></mesh>
    <mesh position={[0, -.12, 0]} receiveShadow><boxGeometry args={[8.8, .24, 8.8]} /><meshStandardMaterial color="#53351e" roughness={.38} /></mesh>
    <BoardLetters />
    {Array.from(board, (piece, index) => {
      const square = coord(index), target = destinations.includes(square), chosen = selected === square
      const recent = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square
      const ping = pings.includes(index), light = (index % 8 + Math.floor(index / 8)) % 2 === 1
      return <group key={square} name={`square-${square}`} position={[index % 8 - 3.5, .025, 3.5 - Math.floor(index / 8)]}
        onClick={onSquare ? event => { event.stopPropagation(); if (event.button === 0 && event.delta < 8 && !disabled) onSquare(index) } : undefined}>
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

export function ChessKeyboardBoard(props: ChessBoardProps) {
  const visible = Array.from({ length: 64 }, (_, i) => props.blackView ? Math.floor(i / 8) * 8 + 7 - i % 8 : (7 - Math.floor(i / 8)) * 8 + i % 8)
  return <div className="chess-board" role="group" aria-label="체스판 칸 선택">{visible.map(index => {
    const piece = props.board[index], square = coord(index), target = props.destinations.includes(square)
    return <button key={square} type="button" className={`chess-square${props.selected === square ? ' selected' : ''}${target ? ' legal' : ''}`}
      aria-label={`${square} ${piece === '.' ? '빈 칸' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}${target ? ' 이동 가능' : ''}`}
      aria-pressed={props.selected === square} aria-disabled={props.disabled} onClick={() => { if (!props.disabled) props.onSquare?.(index) }}>
      <strong>{square}</strong><small>{piece === '.' ? '·' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}</small>
    </button>
  })}</div>
}
