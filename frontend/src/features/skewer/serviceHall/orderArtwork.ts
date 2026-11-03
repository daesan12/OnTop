import order1 from './art/order-1.png'
import order2 from './art/order-2.png'
import order3 from './art/order-3.png'
import order4 from './art/order-4.png'
import order5 from './art/order-5.png'
import order6 from './art/order-6.png'

/** Menu illustrations keyed by the exact assembly including each independent cheese/bacon cube.
 * Never bind by menu index: a recipe change must not silently keep a stale picture.
 * Baked 960px images share the same recipe-driven illustration on PC and the Quest canvas board. */
export const ORDER_ARTWORK = new Map<string, string>([
  ['tomato,cheese,pepper,cheese,shrimp,beef', order1],
  ['bacon,beef,bacon,tomato,shrimp,pepper', order2],
  ['cheese,shrimp,cheese,tomato,bacon,pepper,bacon,beef', order3],
  ['bacon,beef,bacon,cheese,pepper,cheese,shrimp,tomato', order4],
  ['cheese,pepper,cheese,tomato,cheese,bacon,shrimp,bacon,beef', order5],
  ['bacon,beef,bacon,shrimp,bacon,cheese,pepper,cheese,tomato', order6],
])
