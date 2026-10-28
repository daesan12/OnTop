import type { BreadTool } from './rulesV4';

/** Shared by the real filling instances and the accessible DOM indicators. */
export const INGREDIENT_LOOK: Record<BreadTool, { color: string; ink: string; description: string }> = {
  batter: { color: '#eee0bb', ink: '#493b27', description: '빈 칸에 반죽을 부어요' },
  bean: { color: '#a34551', ink: '#762d39', description: '주문에 맞춰 팥을 넣어요' },
  custard: { color: '#f5ca4b', ink: '#735413', description: '주문에 맞춰 슈크림을 넣어요' },
  pizza: { color: '#ed833d', ink: '#923c18', description: '주문에 맞춰 피자 소를 넣어요' },
  chocolate: { color: '#493026', ink: '#493026', description: '주문에 맞춰 초코를 넣어요' },
};

/** Heat assignment and common rush acceleration are separate, visible concepts. */
export function heatLook(heat: number, at: number, rules: { rushFromMs: number; sideMs: number; rushSideMs: number }) {
  const rush = at >= rules.rushFromMs;
  const band = heat <= 93 ? 'low' : heat >= 107 ? 'high' : 'medium';
  return { band, label: band === 'low' ? '약불' : band === 'high' ? '센불' : '보통불',
    flames: band === 'low' ? 1 : band === 'high' ? 3 : 2,
    speed: heat / 100 * (rush ? rules.sideMs / rules.rushSideMs : 1), rush };
}

export interface FeedbackPoint { x: number; y: number }
export interface BungFeedback {
  id: number;
  kind: 'store' | 'discard' | 'deliver';
  filling: BreadTool;
  from: FeedbackPoint;
  breadId?: number;
  guestIndex?: number;
  guestOrderId?: string;
  points: number;
  message: string;
  burnt?: boolean;
  fromWorld?: [number, number, number];
  toWorld?: [number, number, number];
}
