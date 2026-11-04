import { ingredientName } from '../game'
import { IngredientIcon } from '../OrderDisplay'
import { chefPresentation } from './chefPresentation'
import type { ChefView } from './model'

export function ChefAssembly({ view }: { view: ChefView }) {
  const { job, guide, title, detail, tone } = chefPresentation(view)
  return <section className="chef-current" data-tone={tone} aria-label="현재 조립 안내">
    <div className="chef-progress-heading"><span>{job ? `${String(job.table).padStart(2, '0')}번 조립 중` : '주문 대기'}</span><strong>{title}</strong><small>{guide ? `${guide.completed} / ${guide.expected.length}` : '—'}</small></div>
    {guide ? <ol className="chef-progress-steps" aria-label="현재 조립 단계">{guide.expected.map((id, i) => <li key={i} className={i < guide.completed ? 'is-done' : i === guide.next ? guide.mismatch ? 'is-wrong' : 'is-next' : ''} aria-current={i === guide.next ? 'step' : undefined}>
      <b>{i < guide.completed ? '✓' : i + 1}</b><IngredientIcon id={id} /><span>{ingredientName(id)}</span>
    </li>)}</ol> : null}
    <p className="chef-progress-detail">{detail}</p>
    <p className="chef-sr-only" aria-label="내 꼬치 조립 순서">{view.skewer.length ? view.skewer.map(ingredientName).join(' → ') : '빈 꼬치'}</p>
  </section>
}
