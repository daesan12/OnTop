import { MenuArt } from './MenuArt'
import { HallIcon } from './Icons'
import { groupOrderDishes } from './orderSummary'
import type { IngredientId } from '../game'

/** Shared by the customer's bubble and the server's collected ticket. */
export function OrderContents({ table, dishes, sake }: {
  table: number; dishes: readonly { recipe: readonly IngredientId[] }[]; sake: number
}) {
  return <div className="service-order-cells">
    <b className="service-order-number">{String(table).padStart(2, '0')}</b>
    <div className="service-order-recipes">{groupOrderDishes(dishes).map(group =>
      <div className="service-order-recipe" key={group.key} data-quantity={group.count}>
        <MenuArt recipe={group.recipe} label={`${table}번 꼬치 ${group.count}개`} angled />
        <b className="service-order-quantity">×{group.count}</b>
      </div>,
    )}{!dishes.length && <span className="service-order-done">꼬치 완료</span>}</div>
    <span className={`service-order-sake${sake ? '' : ' is-empty'}`} aria-label={`사케 ${sake}병`}>
      <HallIcon name="sake" /><b className="service-order-quantity">×{sake}</b>
    </span>
  </div>
}
