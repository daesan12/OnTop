import { validCooperativeRecipe } from '../cooperativeMenu'
import { ingredientName } from '../game'
import { assemblyGuide } from '../presentation'
import type { ChefView } from './model'

/** Only delivered orders are supplied here; PC and the world-space VR board share these hints. */
export function chefPresentation(view: ChefView) {
  const job = view.visible.find(order => order.id === view.selectedJob)
  const guide = job ? assemblyGuide(view.skewer, job.recipe) : null
  const coop = view.cooperative
  const blocked = view.seconds <= 0 || !!coop && (coop.phase !== 'PLAYING' || coop.paused || coop.greeting)
  let title = '주문표를 기다리고 있어요', detail = '서빙 담당이 전달한 주문만 확인할 수 있어요.'
  let tone: 'idle' | 'working' | 'ready' | 'warning' = 'idle'
  if (guide) {
    tone = 'working'
    if (guide.mismatch) {
      title = '끝 재료부터 빼서 고쳐주세요'; detail = '주문 그림의 순서와 개수를 확인해요.'; tone = 'warning'
    } else if (guide.complete) {
      title = `${String(job!.table).padStart(2, '0')}번 꼬치 완성!`; detail = '완성 접시를 제출하면 서빙 담당이 가져갈 수 있어요.'; tone = 'ready'
    } else if (guide.next !== null) {
      const next = guide.expected[guide.next]
      title = `다음은 ${ingredientName(next)}`
      detail = guide.reversed ? '반대 방향으로 조립 중 · 재료 개수도 맞춰주세요.' : '그림 순서로 꽂아요 · 반대 방향으로 만들어도 정답이에요.'
    }
  }
  if (guide?.complete && view.pass.length >= 2) { title = '전달대가 가득 찼어요'; detail = '완성한 꼬치는 유지돼요. 서빙 담당의 수령을 기다려요.'; tone = 'warning' }
  if (blocked) {
    tone = 'idle'
    title = coop?.paused ? '연결 복구 중 · 조리 잠시 멈춤' : coop?.greeting ? coop.answered ? '친구의 인사를 기다려요' : '손님께 함께 인사해요' : coop?.phase === 'COUNTDOWN' ? '곧 영업을 시작해요' : coop?.phase === 'WAITING' ? '두 사람의 준비를 기다려요' : '영업이 끝났어요'
    detail = coop?.greeting ? '영업시간은 계속 흘러요. 빠르게 함께 인사해요!' : '영업 상태에 맞춰 조리를 이어갈 수 있어요.'
  }
  return { job, guide, blocked, title, detail, tone,
    submitReady: !blocked && !!job && validCooperativeRecipe(view.skewer) && view.pass.length < 2,
    submitLabel: blocked ? '조리 대기 중' : view.pass.length >= 2 ? '전달대 수령 대기' : guide?.complete ? `${String(job!.table).padStart(2, '0')}번 접시 제출` : '완성 접시 제출' }
}
