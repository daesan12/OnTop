import { MINI_PROPS } from '../../park/mapConfig';
import { renewalMap } from '../../park/renewalMap';
const cart = MINI_PROPS.find(p => p.id === 'fish-bread')!;
export type Point3 = [number, number, number];
export const renewalBreadShop = renewalMap?.data.interactions.recreation?.find(anchor => anchor.id === 'fish-bread');
const [cartX, cartY, cartZ] = renewalBreadShop?.position ?? [cart.x, 0, cart.z];
export const cartPoint = (x: number, y: number, z: number): Point3 => [cartX + x, cartY + y, cartZ + z];
/** Two staggered shelves keep both rows readable from the cooking camera. */
export const trayPoint = (index: number): Point3 => cartPoint(.47 + (index % 5) * .205, index < 5 ? 1.265 : 1.56, index < 5 ? .16 : -.15);
export const customerPoint = (slot: number): Point3 => cartPoint(-1.16 + slot * .50, -.045, -1.02);
export const trashPoint = cartPoint(1.71, 1.2, .72);
/** The render loop owns fast-changing readouts; React only owns structure and refs. */
export const v5HeatEls: (HTMLElement | null)[] = Array(6).fill(null);
/** Small flame outlets around the real plate edges, leaving the food and central meter clear. */
export const BURNER_JET_OFFSETS = [
  [-.198, -.09], [-.198, .015], [-.198, .115], [-.16, .16],
  [.16, .16], [.198, .115], [.198, .015], [.198, -.09],
] as const;
export const burnerJetEls: (HTMLElement | null)[][] = Array.from({ length: 6 }, () => Array(8).fill(null));
