import { MenuArt } from './MenuArt'
import { HallIcon } from './Icons'
import { groupOrderDishes } from './orderSummary'
import type { IngredientId } from '../game'

const COMMON_SKEWER_ICON: readonly IngredientId[] = ['tomato', 'pepper', 'beef']

/** 홀 말풍선은 메뉴 수량만, 수거한 주문표는 실제 조합을 표시한다. */
export function OrderContents({ table, dishes, sake, summarized = false }: {
  table: number; dishes: readonly { recipe: readonly IngredientId[] }[]; sake: number; summarized?: boolean
}) {
  if (summarized) return <div className="service-order-summary">
    <b className="service-order-table">{table}</b>
    {dishes.length > 0 ? <span className="service-order-menu is-skewer" aria-label={`꼬치 ${dishes.length}개`}>
      <MenuArt recipe={COMMON_SKEWER_ICON} label="꼬치" angled />
      <sup aria-hidden="true">{dishes.length}</sup>
    </span> : null}
    {sake > 0 ? <span className="service-order-menu is-sake" aria-label={`사케 ${sake}병`}>
      <HallIcon name="sake" /><sup aria-hidden="true">{sake}</sup>
    </span> : null}
  </div>
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
