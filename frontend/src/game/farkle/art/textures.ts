import { CanvasTexture, SRGBColorSpace } from "three";
import { seeded } from "../../../world/art/Instances";

function canvas(width: number, height = width) {
  const image = document.createElement("canvas");
  image.width = width;
  image.height = height;
  return { image, ctx: image.getContext("2d")! };
}

function texture(image: HTMLCanvasElement, color = true) {
  const map = new CanvasTexture(image);
  if (color) map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

// Original procedural surface detail, generated once on the first Farkle table.
// The video is an art reference only; no source-game pixels or assets are used.
export function leatherMaps() {
  const { image, ctx } = canvas(256);
  const height = canvas(256);
  const random = seeded(713);
  ctx.fillStyle = "#835b3d";
  ctx.fillRect(0, 0, 256, 256);
  height.ctx.fillStyle = "#999999";
  height.ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18000; i++) {
    const x = random() * 256,
      y = random() * 256;
    const light = random() > 0.48;
    ctx.fillStyle = light ? "rgba(220,178,119,0.10)" : "rgba(25,14,8,0.17)";
    ctx.fillRect(x, y, 0.6 + random() * 2.4, 0.6 + random() * 1.2);
    height.ctx.fillStyle = light ? "#c0c0c0" : "#606060";
    height.ctx.fillRect(x, y, 1.1, 1);
  }
  for (let i = 0; i < 90; i++) {
    const x = random() * 256,
      y = random() * 256;
    ctx.strokeStyle = "rgba(28,15,8,0.16)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 4, y + 7, x + 5, y + 12, x + 2, y + 18);
    ctx.stroke();
  }
  // Hand-burnished lip, base and a darker overlapping longitudinal seam.
  const patina = ctx.createLinearGradient(0, 0, 0, 256);
  patina.addColorStop(0, "rgba(32,15,6,0.44)");
  patina.addColorStop(0.12, "rgba(243,187,119,0.17)");
  patina.addColorStop(0.5, "rgba(0,0,0,0)");
  patina.addColorStop(1, "rgba(27,13,5,0.5)");
  ctx.fillStyle = patina;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(34,17,9,0.35)";
  ctx.fillRect(124, 0, 9, 256);
  return { map: texture(image), bumpMap: texture(height.image, false) };
}

const layouts = [
  [[0, 0]],
  [
    [-1, -1],
    [1, 1],
  ],
  [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  [
    [-1, -1],
    [-1, 1],
    [0, 0],
    [1, -1],
    [1, 1],
  ],
  [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
];

// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z. Opposite faces sum to seven.
export const atlasFaces = [3, 4, 1, 6, 2, 5] as const;

export function boneMaps() {
  const { image, ctx } = canvas(384, 256);
  const height = canvas(384, 256);
  const random = seeded(4071);
  height.ctx.fillStyle = "#b0b0b0";
  height.ctx.fillRect(0, 0, 384, 256);
  atlasFaces.forEach((value, face) => {
    const ox = (face % 3) * 128,
      oy = Math.floor(face / 3) * 128;
    ctx.fillStyle = "#d8c69e";
    ctx.fillRect(ox, oy, 128, 128);
    const patina = ctx.createRadialGradient(
      ox + 60,
      oy + 56,
      15,
      ox + 64,
      oy + 64,
      86,
    );
    patina.addColorStop(0, "rgba(255,247,213,0.45)");
    patina.addColorStop(0.64, "rgba(190,154,91,0.1)");
    patina.addColorStop(1, "rgba(91,60,27,0.43)");
    ctx.fillStyle = patina;
    ctx.fillRect(ox, oy, 128, 128);
    for (let i = 0; i < 1800; i++) {
      const x = ox + random() * 128,
        y = oy + random() * 128;
      ctx.fillStyle =
        random() > 0.5 ? "rgba(89,63,30,0.10)" : "rgba(255,248,216,0.19)";
      ctx.fillRect(x, y, 0.4 + random(), 0.4 + random() * 1.5);
    }
    for (const [px, py] of layouts[value - 1]!) {
      const x = ox + 64 + px * 25,
        y = oy + 64 + py * 25;
      // Circular carved rim and a recessed dark well, with a matching height map.
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "#82623b";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const well = ctx.createRadialGradient(x - 1, y - 2, 0, x, y, 6.2);
      well.addColorStop(0, "#241c12");
      well.addColorStop(0.65, "#493821");
      well.addColorStop(1, "#ab8953");
      ctx.fillStyle = well;
      ctx.beginPath();
      ctx.arc(x, y, 6.2, 0, Math.PI * 2);
      ctx.fill();
      const depression = height.ctx.createRadialGradient(x, y, 0, x, y, 8.8);
      depression.addColorStop(0, "#202020");
      depression.addColorStop(0.5, "#444444");
      depression.addColorStop(0.78, "#bbbbbb");
      depression.addColorStop(1, "#b0b0b0");
      height.ctx.fillStyle = depression;
      height.ctx.fillRect(x - 9, y - 9, 18, 18);
    }
  });
  return { map: texture(image), bumpMap: texture(height.image, false) };
}

export function boardWearMap() {
  const { image, ctx } = canvas(512);
  const random = seeded(631);
  // Irregular marks stay subtle; the real wood PBR maps supply the grain.
  for (let i = 0; i < 420; i++) {
    const x = random() * 512,
      y = random() * 512;
    ctx.strokeStyle = i % 3 ? "rgba(32,17,8,0.17)" : "rgba(230,200,147,0.20)";
    ctx.lineWidth = 0.3 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + random() * 39, y + (random() - 0.5) * 8);
    ctx.stroke();
  }
  const edge = ctx.createRadialGradient(256, 256, 125, 256, 256, 350);
  edge.addColorStop(0, "rgba(24,12,4,0)");
  edge.addColorStop(1, "rgba(24,12,4,0.38)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 512, 512);
  return texture(image);
}

export function contactMap() {
  const { image, ctx } = canvas(64);
  const gradient = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
  gradient.addColorStop(0, "rgba(22,12,5,0.42)");
  gradient.addColorStop(0.45, "rgba(22,12,5,0.28)");
  gradient.addColorStop(1, "rgba(22,12,5,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return texture(image);
}
