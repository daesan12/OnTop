import { INGREDIENT_ART } from './ingredientArt'
import { ingredientName, pieceLabel } from './game'
import type { IngredientId } from './game'
import { assemblyGuide, recipeNotes } from './presentation'

function FoodPaths({ id }: { id: IngredientId }) {
  return <>{INGREDIENT_ART[id].map((path, index) => <path key={index} d={path.d} fill={path.fill ?? 'none'} stroke={path.stroke} strokeWidth={path.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}</>
}

export function IngredientIcon({ id }: { id: IngredientId }) {
  return <svg className="sk-food-icon" viewBox="0 0 44 44" aria-hidden="true"><FoodPaths id={id} /></svg>
}

export function SkewerPreview({ ids, label }: { ids: readonly IngredientId[]; label: string }) {
  const x = (index: number) => 28 + index * (304 / Math.max(ids.length - 1, 1))
  return <svg className="sk-wrap-preview" viewBox="0 0 360 134" role="img" aria-label={label}>
    <path d="M9 89H350l-6-3" fill="none" stroke="#b28b4e" strokeWidth="3" strokeLinecap="round" />
    {ids.map((id, index) => <g key={index} transform={`translate(${x(index) - 22},65)`}><FoodPaths id={id} /></g>)}
    {!ids.length ? <text x="180" y="123" textAnchor="middle" fontSize="13" fill="#6c7463">아직 빈 꼬치예요</text> : null}
  </svg>
}

export function OrderDisplay({ recipe, actual, showSteps = true }: { recipe: readonly IngredientId[]; actual?: readonly IngredientId[]; showSteps?: boolean }) {
  const guide = actual ? assemblyGuide(actual, recipe) : null
  const expected = guide?.expected ?? recipe
  return <div className="sk-order-display">
    <figure className="sk-order-example"><figcaption>완성 예시</figcaption><SkewerPreview ids={expected} label="주문의 완성 예시" />
      <div className="sk-wrap-notes">{recipeNotes(expected).map(text => <p key={text}>{text}</p>)}</div>
    </figure>
    {showSteps ? <>
      <div className="sk-step-heading"><h3>이 순서로 꽂아주세요</h3>{guide ? <span>{guide.completed}/{expected.length} 순서 일치</span> : null}</div>
      <ol className={`sk-recipe sk-steps sk-steps-${expected.length}`} aria-label="주문 조립 순서">
        {expected.map((id, index) => {
          const done = guide && index < guide.completed
          const next = guide?.next === index
          const status = done ? '완료' : next ? guide.mismatch ? '순서 확인' : '다음 단계' : '대기'
          return <li key={index} data-ingredient={id} data-step-status={status} className={done ? 'sk-step-done' : next ? guide?.mismatch ? 'sk-step-wrong' : 'sk-step-next' : ''} aria-label={`${index + 1}. ${pieceLabel(expected, index)} · ${status}`} aria-current={next ? 'step' : undefined}>
            <span className="sk-step-number">{done ? <svg viewBox="0 0 16 16" aria-label="완료"><path d="m3 8 3 3 7-7" /></svg> : index + 1}</span>
            <IngredientIcon id={id} /><span>{ingredientName(id)}</span>
          </li>
        })}
      </ol>
    </> : null}
  </div>
}
