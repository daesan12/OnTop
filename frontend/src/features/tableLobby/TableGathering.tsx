import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, Group, LinearFilter, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { TABLES, tableScale } from '../../config'
import { panelOwnsKeys } from '../../world/inputOwnership'
import { useSession } from '../../network/worldClient'
import { useGathering, getGathering } from './gathering'
import { GATHERING, GATHERING_BUTTONS, gatheringHit, type GatheringModel } from './gatheringModel'
import { useTableLobby } from './state'

function paint(
  canvas: HTMLCanvasElement,
  model: GatheringModel,
  primary: string,
  enabled: boolean,
  participant: boolean,
) {
  const c = canvas.getContext("2d")!;
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = "#f7edd9",
    weight = 600,
    width = 900,
  ) => {
    c.fillStyle = color;
    c.font = `${weight} ${size}px "Malgun Gothic", "Noto Sans KR", sans-serif`;
    c.fillText(value, x, y, width);
  };
  c.fillStyle = "#263b33";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = "#b19865";
  c.lineWidth = 3;
  c.strokeRect(16, 16, 992, 608);
  text(model.title, 46, model.finished ? 73 : 115, model.finished ? 38 : 64);
  c.textAlign = "right";
  text(
    model.gameName,
    978,
    model.finished ? 70 : 112,
    model.finished ? 26 : 42,
    "#cfc8ad",
    500,
    600,
  );
  c.textAlign = "left";
  text(
    model.headline,
    46,
    model.finished ? 134 : 276,
    model.finished ? 32 : 78,
    model.finished ? "#f1cf87" : "#bde6c8",
    700,
  );
  if (!model.finished)
    text("관전자와 함께 준비해요", 46, 400, 40, "#d0d7c8", 500);
  for (const row of model.finished ? model.rows : []) {
    const y = 162 + row.seat * 83;
    c.fillStyle = row.winner ? "#5a5033" : "#30483d";
    c.fillRect(42, y, 940, 73);
    text(String(row.seat + 1).padStart(2, "0"), 60, y + 48, 28, "#baad8f");
    text(row.nickname, 124, y + 48, 30, "#fff6e4", 600, 472);
    c.textAlign = "right";
    text(
      [row.score, row.label].filter(Boolean).join(" · "),
      956,
      y + 47,
      27,
      row.winner
        ? "#ffe2a2"
        : row.ready && !model.finished
          ? "#a7ebbc"
          : "#d0d7c8",
      600,
      350,
    );
    c.textAlign = "left";
  }
  for (const [key, r] of Object.entries(GATHERING_BUTTONS)) {
    c.fillStyle =
      key === "primary" ? (enabled ? "#d2e9cb" : "#617766") : "#3b5145";
    c.fillRect(r.x, r.y, r.width, r.height);
    c.textAlign = "center";
    text(
      key === "primary"
        ? primary
        : !participant
          ? "게임 설명"
          : model.finished
            ? "결과 자세히"
            : "게임 설정",
      r.x + r.width / 2,
      r.y + 50,
      model.finished ? 30 : 40,
      key === "primary" && enabled ? "#203f30" : "#ebeedf",
      700,
      r.width - 24,
    );
    c.textAlign = "left";
  }
}


export function TableGathering() {
  const model = useGathering()
  const binding = useSession(s => s.bindings.find(b => b.channelId === s.roomId && b.tableId === s.tableId))
  const anchor = TABLES.find(t => t.id === binding?.anchorId)
  if (!model || !anchor) return null
  return <GatheringConsole key={model.tableId} model={model} anchor={anchor} />
}
function GatheringConsole({model, anchor}: { model: GatheringModel; anchor: typeof TABLES[number] }) {
  const root = useRef<Group>(null), signature = useRef('')
  const pending = useSession(s => s.pending), connected = useSession(s => s.status === 'connected')
  const participant = true
  const enabled = connected && !pending && (model.finished ? true : !!model.own && !model.own.ready && model.playable)
  const primary = model.finished ? model.canReturn ? '다음 게임 준비' : '정산 결과 확인' : model.own?.ready ? '다른 참가자 준비 대기' : model.gameCode ? '대국 준비' : '게임을 골라 주세요'
  const scale = Math.sqrt(tableScale(anchor)), tilt = model.finished ? -1.25 : -0.6, heightScale = model.finished ? 1 : 0.6
  const centerHeight = 1.1 + GATHERING.height * 0.5 * heightScale * Math.cos(tilt) * scale
  const resources = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = GATHERING.textureWidth;
    canvas.height = GATHERING.textureHeight;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    const face = new MeshBasicMaterial({ map: texture, toneMapped: false });
    const wood = new MeshStandardMaterial({
      color: "#59442f",
      roughness: 0.88,
    });
    return {
      canvas,
      texture,
      face,
      wood,
      box: new BoxGeometry(
        GATHERING.width + 0.05,
        GATHERING.height + 0.05,
        0.065,
      ),
      plane: new PlaneGeometry(GATHERING.width, GATHERING.height),
    };
  }, []);
  useEffect(() => {
    const nextSignature = JSON.stringify([model, primary, enabled, participant]);
    if (signature.current === nextSignature) return;
    signature.current = nextSignature;
    paint(resources.canvas, model, primary, enabled, participant);
    resources.texture.needsUpdate = true;
  }, [resources, model, primary, enabled, participant]);
  useEffect(
    () => () => {
      resources.texture.dispose();
      resources.face.dispose();
      resources.wood.dispose();
      resources.box.dispose();
      resources.plane.dispose();
    },
    [resources],
  );
  useFrame(({ camera }) => {
    if (!root.current) return;
    const dx = camera.position.x - anchor.position[0];
    const dz = camera.position.z - anchor.position[2];
    // A tabletop object rotates about its vertical axis only; the wood edge and
    // sloped face retain perspective. No frame-by-frame React state or uploads.
    root.current.rotation.y = Math.atan2(dx, dz);
    const distance = Math.hypot(dx, dz);
    const side = model.finished ? 0.4 * scale : 0;
    if (distance > 0.001) {
      root.current.position.x = anchor.position[0] + (dz / distance) * side;
      root.current.position.z = anchor.position[2] - (dx / distance) * side;
    }
    root.current.visible = Math.hypot(dx, dz) < GATHERING.nearbyRadius * scale;
  });

  function click(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    if (event.button !== 0 || panelOwnsKeys() || !event.uv || getGathering()?.scope !== model.scope) return
    const action = gatheringHit(event.uv.x, event.uv.y)
    if (action === 'settings') useTableLobby.setState({ gatheringDetails: model.scope })
    if (action === 'primary' && enabled) window.dispatchEvent(new Event('ontop-gathering-primary'))
  }
  return <group ref={root} name="table-gathering" position={[anchor.position[0], anchor.position[1] + centerHeight, anchor.position[2]]}
    scale={scale} userData={{ assetId: 'table-gathering-console', keepOpaque: true }} dispose={null}>
    <group rotation={[tilt, 0, 0]} scale={[1, heightScale, 1]}>
      <mesh geometry={resources.box} material={resources.wood} />
      <mesh name="gathering-face" geometry={resources.plane} material={resources.face} position={[0, 0, 0.034]} onClick={click} />
    </group>
  </group>
}
