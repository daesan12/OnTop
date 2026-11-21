import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { ChessPiece3D, createChessPieceGeometry, disposeChessPieceGeometry } from './ChessPiece3D'
import { createChessMaterials } from './materials'
import { ChessMoveHints } from './ChessMoveHints'
import { chessMoveHints } from './moveHints'

const labels: Record<string, string> = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' }
const coord = (index: number) => `${'abcdefgh'[index % 8]}${1 + Math.floor(index / 8)}`
export type ChessBoardProps = {
  board: string; blackView: boolean; selected: string; destinations: string[]; lastMove?: string; checkedSquare?: string
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

export function ChessBoardScene({ board, blackView, selected, destinations, lastMove, checkedSquare, pings, disabled, onSquare, angle = 0, layer = 0 }: ChessBoardProps & { angle?: number; layer?: number }) {
  const root = useRef<Group>(null)
  useLayoutEffect(() => { root.current?.traverse(object => { object.layers.set(0); if (layer) object.layers.enable(layer) }) })
  const resources = useMemo(() => ({ geometry: createChessPieceGeometry(), materials: createChessMaterials() }), [])
  useEffect(() => () => {
    disposeChessPieceGeometry(resources.geometry); resources.materials.dispose()
  }, [resources])
  return <group ref={root} rotation-y={(blackView ? Math.PI : 0) + angle}>
    <mesh position={[0, -.24, 0]} receiveShadow><boxGeometry args={[8.9, .12, 8.9]} /><meshStandardMaterial color="#b69251" roughness={.5} /></mesh>
    <mesh position={[0, -.12, 0]} receiveShadow><boxGeometry args={[8.8, .24, 8.8]} /><meshStandardMaterial color="#53351e" roughness={.38} /></mesh>
    <BoardLetters />
    <ChessMoveHints board={board} selected={selected} destinations={destinations} />
    {Array.from(board, (piece, index) => {
      const square = coord(index), chosen = selected === square, danger = checkedSquare === square && piece.toUpperCase() === 'K'
      const recent = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square
      const ping = pings.includes(index), light = (index % 8 + Math.floor(index / 8)) % 2 === 1
      return <group key={square} name={`square-${square}`} position={[index % 8 - 3.5, .025, 3.5 - Math.floor(index / 8)]}
        onClick={onSquare ? event => { event.stopPropagation(); if (event.button === 0 && event.delta < 8 && !disabled) onSquare(index) } : undefined}>
        <mesh receiveShadow><boxGeometry args={[.998, .05, .998]} /><meshStandardMaterial roughness={.56}
          color={danger ? '#a33e32' : chosen ? '#baa75a' : recent ? light ? '#dbc784' : '#a59852' : light ? '#ead2a8' : '#a3744c'} /></mesh>
        {piece !== '.' && <group position={[0, .026, 0]}><ChessPiece3D piece={piece} geometry={resources.geometry}
          material={piece === piece.toUpperCase() ? danger ? resources.materials.whiteCheck : resources.materials.white : danger ? resources.materials.blackCheck : resources.materials.black}
          detail={resources.materials.gold} eye={resources.materials.eye}
          mane={piece === piece.toUpperCase() ? resources.materials.whiteMane : resources.materials.blackMane} /></group>}
        {(ping || chosen || danger) && <mesh position={[0, .085, 0]} rotation-x={-Math.PI / 2} raycast={() => {}}>
          <ringGeometry args={[.575, .66, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={danger ? '#ff7161' : ping ? '#238fae' : '#f4cf6d'} />
        </mesh>}
      </group>
    })}
  </group>
}

export function ChessKeyboardBoard(props: ChessBoardProps) {
  const targets = chessMoveHints(props.board, props.selected, props.destinations).targets
  const visible = Array.from({ length: 64 }, (_, i) => props.blackView ? Math.floor(i / 8) * 8 + 7 - i % 8 : (7 - Math.floor(i / 8)) * 8 + i % 8)
  return <div className="chess-board" role="group" aria-label="체스판 칸 선택">{visible.map(index => {
    const piece = props.board[index], square = coord(index), target = targets.find(target => target.index === index), danger = props.checkedSquare === square && piece.toUpperCase() === 'K'
    return <button key={square} type="button" className={`chess-square${props.selected === square ? ' selected' : ''}${target ? target.capture ? ' capture' : ' legal' : ''}${danger ? ' in-check' : ''}`}
      aria-label={`${square} ${piece === '.' ? '빈 칸' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}${danger ? ' 체크 · 킹 위험' : ''}${target ? target.capture ? ' 잡기 가능' : ' 이동 가능' : ''}`}
      aria-pressed={props.selected === square} aria-disabled={props.disabled} onClick={() => { if (!props.disabled) props.onSquare?.(index) }}>
      <strong>{square}</strong><small>{piece === '.' ? '·' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}</small>
    </button>
  })}</div>
}
