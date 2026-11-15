import type { FortuneCardContent } from './model'
import cardFront from './art/tapgol-card-front-v6.png'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import './fortune.css'

export function FortuneCard({ game }: { game: FortuneCardContent }) {
  return <article className="fortune-card" style={{ backgroundImage: `url("${cardFront}")` }} aria-label="나의 운세 카드" data-game={game.id}>
    <div className="fortune-card__top">오늘 추천하는 게임</div>
    <div className="fortune-card__art"><img src={game.art} alt={`${game.name} 게임`} draggable={false}/></div>
    <div className="fortune-card__body"><h3>{game.name}</h3><img className="fortune-card__seal" src={coinImage} alt=""/></div>
  </article>
}
