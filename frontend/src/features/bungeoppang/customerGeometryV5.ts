import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PropBuilder, type XYZ } from './devArt/propGeometry';

/** Private queue actors: adult proportions, layered clothes and modelled facial features. */
export function customerGeometry(shirt: string, index: number) {
  const b = new PropBuilder([18, 12]), skin = ['#e1b08b', '#bd896b', '#f0c6a3'][index]!;
  const hair = ['#302722', '#49352d', '#231f23'][index]!;
  const box = (color: string, p: XYZ, s: XYZ, radius = .025) =>
    b.add('stone', new RoundedBoxGeometry(...s, 3, radius), color, p);
  // Slightly tapered jacket, visible undershirt, hem, collar, cuffs and stitched pockets.
  b.cylinder('stone', shirt, [0, 1.04, 0], .20, .17, .46, [0, 0, 0], 16);
  box('#ddd5c3', [0, 1.12, .163], [.11, .29, .024], .008);
  for (const sign of [-1, 1]) {
    box(shirt, [sign * .105, 1.055, .15], [.15, .40, .06]);
    box(shirt, [sign * .11, 1.255, .105], [.12, .09, .055], .012);
    b.cylinder('stone', shirt, [sign * .232, 1.06, 0], .071, .058, .38, [0, 0, sign * .12], 16);
    b.cylinder('stone', '#d1c7af', [sign * .256, .855, .006], .059, .056, .04);
    b.ball('stone', skin, [sign * .258, .795, .024], [.053, .074, .043]);
    b.curve('stone', '#9f7960', [[sign * .28, .812, .055], [sign * .27, .78, .063], [sign * .258, .759, .057]], .004, 5);
    box('#34404b', [sign * .092, .47, -.005], [.145, .68, .16]);
    b.curve('stone', '#58616b', [[sign * .15, .75, .08], [sign * .15, .44, .08], [sign * .15, .15, .08]], .003, 5);
    box('#332d2b', [sign * .095, .075, .06], [.16, .12, .28]);
    box('#b8ac98', [sign * .095, .026, .065], [.165, .025, .29], .01);
    for (const z of [.08, .115, .15]) b.box('stone', '#c0b49f', [sign * .095, .135, z], [.09, .005, .005]);
    box('#536462', [sign * .112, .955, .19], [.09, .075, .008], .008);
    b.ball('stone', skin, [sign * .143, 1.515, -.002], [.027, .049, .025]);
  }
  b.cylinder('stone', skin, [0, 1.325, 0], .065, .075, .17);
  b.ball('stone', skin, [0, 1.53, 0], [.143, .19, .137]);
  b.ball('stone', hair, [0, 1.655, -.025], [.148, .091, .135]);
  for (let i = 0; i < 6; i++) b.ball('stone', hair, [-.12 + i * .042, 1.647 - Math.abs(i - 2) * .006, .085], [.044, .058, .045]);
  for (const sign of [-1, 1]) {
    b.ball('stone', '#f0e9de', [sign * .054, 1.551, .123], [.026, .012, .012]);
    b.ball('stone', '#40332b', [sign * .052, 1.55, .133], [.009, .011, .006]);
    b.ball('stone', '#f7f0dd', [sign * .052 - .003, 1.553, .138], [.0025, .003, .002]);
    b.curve('stone', hair, [[sign * .03, 1.579, .13], [sign * .055, 1.586, .125], [sign * .081, 1.578, .112]], .004, 5);
  }
  b.ball('stone', skin, [0, 1.517, .137], [.022, .032, .029]);
  b.curve('stone', '#91594c', [[-.035, 1.465, .114], [0, 1.459, .128], [.035, 1.465, .114]], .004, 8);
  for (const y of [.92, 1.02, 1.12]) b.ball('stone', '#d7bd83', [.017, y, .191], [.006, .006, .004]);
  if (index === 1) {
    for (const x of [-.055, .055]) b.ring('stone', '#4f4438', [x, 1.55, .139], .033, .003);
    b.box('stone', '#4f4438', [0, 1.552, .141], [.04, .004, .004]);
  }
  if (index === 2) {
    b.ball('stone', '#9d6247', [0, 1.70, -.015], [.155, .065, .14]);
    b.ball('stone', '#9d6247', [0, 1.664, .13], [.15, .012, .09]);
  }
  return b.finish().stone!;
}
