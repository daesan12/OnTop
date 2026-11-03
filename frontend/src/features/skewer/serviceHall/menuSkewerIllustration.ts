import { validAssembly } from '../game'
import type { IngredientId } from '../game'

// Menu illustrations, separate from the physical food meshes. Every recipe piece stays explicit.
const food: Record<IngredientId, string> = {
  tomato: `<ellipse cx="0" cy="1" rx="32" ry="34" fill="url(#tomato)" stroke="#a82c24" stroke-width="2"/>
    <path d="M-20-11Q-26-2-22 6" fill="none" stroke="#ffd9ad" stroke-width="6" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="-17" cy="-17" rx="4" ry="2.5" fill="#fff1d8" transform="rotate(-35 -17 -17)"/>`,
  pepper: `<path d="M-38-26Q-23-48-5-39 14-52 30-34 50-26 42-7 51 14 30 24 20 48-1 36-24 49-35 26-55 15-42-6Z M-19-18Q-8-27 0-22 16-31 20-15 33-6 21 6 22 24 4 19-10 30-19 15-34 9-24-4Z" fill="#316e27" fill-rule="evenodd" stroke="#255d23" stroke-width="2" transform="translate(5 8)"/>
    <path d="M-38-26Q-23-48-5-39 14-52 30-34 50-26 42-7 51 14 30 24 20 48-1 36-24 49-35 26-55 15-42-6Z M-19-18Q-8-27 0-22 16-31 20-15 33-6 21 6 22 24 4 19-10 30-19 15-34 9-24-4Z" fill="url(#pepper)" fill-rule="evenodd" stroke="#629536" stroke-width="2"/>
    <path d="M-34-24Q-23-38-10-32M6-34Q17-40 26-26M34-8Q40 6 29 14M-23 28Q-13 35-5 29" fill="none" stroke="#d3e783" stroke-width="5" stroke-linecap="round"/>
    <path d="M-20-16Q-8-25 0-20 15-28 20-14" fill="none" stroke="#e5e8a2" stroke-width="3"/>`,
  shrimp: `<path d="M27-28C-1-51-42-34-40-3-39 28-12 42 13 23 24 15 22 3 13 1" fill="none" stroke="#c35c38" stroke-width="36" stroke-linecap="round"/>
    <path d="M26-31C-1-51-40-34-38-4-37 25-12 39 12 21 22 14 21 4 13 2" fill="none" stroke="url(#shrimp)" stroke-width="31" stroke-linecap="round"/>
    <path d="M10-45 4-23M-12-45-9-21M-32-32-17-17M-44-9-20-5M-37 15-17 4M-18 32-11 10M2 29-3 9" fill="none" stroke="#e87f4c" stroke-width="4" stroke-linecap="round"/>
    <path d="M-22-34Q-33-27-35-17M-32-6Q-31 9-22 14" fill="none" stroke="#fff0ce" stroke-width="6" stroke-linecap="round"/>
    <path d="M23-27Q28-46 44-40L37-26 53-23Q50-8 34-13L22-20Z" fill="#ed7543" stroke="#ba4e30" stroke-width="2"/>
    <path d="M30-25 39-34M33-21 45-20" stroke="#ffbe7c" stroke-width="3" stroke-linecap="round"/>`,
  beef: `<path d="M-40-29-25-43 31-35 44-19 40 35 24 46-36 39-47 22Z" fill="#6f311c" stroke="#51291a" stroke-width="2"/>
    <path d="M-40-29-25-43 31-35 44-19 27-8-25-15Z" fill="url(#beefTop)"/>
    <path d="M27-8 44-19 40 35 24 46Z" fill="#7e3b20"/>
    <path d="M-40-29Q-29-30-25-24L27-15 24 41Q0 45-34 33L-41 18Z" fill="url(#beef)"/>
    <path d="M-28-18-20 33M-8-16 0 38M12-12 20 36" fill="none" stroke="#65301c" stroke-width="7" stroke-linecap="round"/>
    <path d="M-32-33-18-21M-12-36 1-20M10-33 22-19" stroke="#73371f" stroke-width="6" stroke-linecap="round"/>
    <path d="M-32-23-28-5M-16 21-14 29M5-5 8 7" stroke="#e6a164" stroke-width="3" stroke-linecap="round" opacity=".85"/>`,
  cheese: `<path d="M-42-28-24-42 40-32 43 25 25 42-39 33Z" fill="#d58a21" stroke="#c18023" stroke-width="2"/>
    <path d="M-42-28-24-42 40-32 24-15Z" fill="#ffdc74"/>
    <path d="M24-15 40-32 43 25 25 42Z" fill="#e9a833"/>
    <path d="M-42-28 24-15 25 42-39 33Z" fill="url(#cheese)"/>
    <path d="M-38-24 20-13" stroke="#fff0ab" stroke-width="4" stroke-linecap="round"/>
    <g fill="#d79a30" stroke="#ffe397" stroke-width="1.5"><ellipse cx="-25" cy="-7" rx="7" ry="5"/><ellipse cx="4" cy="17" rx="8" ry="6"/><ellipse cx="-25" cy="24" rx="4" ry="3"/><ellipse cx="9" cy="-27" rx="5" ry="2.5"/><ellipse cx="34" cy="7" rx="3" ry="6"/></g>`,
  bacon: `<path d="M-42-28-24-42 40-32 43 25 25 42-39 33Z" fill="#a44432" stroke="#a44432" stroke-width="2"/>
    <path d="M-42-28-24-42 40-32 24-15Z" fill="#eaa08a"/>
    <path d="M24-15 40-32 43 25 25 42Z" fill="#b9543e"/>
    <path d="M-42-28 24-15 25 42-39 33Z" fill="url(#bacon)"/>
    <path d="M-41-16Q-12-15 24-3L41-18 41-7 25 8Q-7-4-40-5ZM-40 9Q-4 10 25 23L42 8 42 19 25 34Q-4 21-39 20Z" fill="#ffe5be"/>
    <path d="M-33-35-16-22 0-19-17-39ZM4-38 20-23 27-18 34-25 19-35Z" fill="#ffdfbb"/>
    <path d="M-35-24Q-13-19 16-12M-34 2-16 7" fill="none" stroke="#ffbda1" stroke-width="3" stroke-linecap="round"/>`,
}

export function menuSkewerIllustration(recipe: readonly IngredientId[], angled = false, receipt = false): string {
  if (!validAssembly(recipe) || !recipe.every(id => id in food)) throw new Error('그릴 수 없는 꼬치 조합입니다.')
  const spacing = angled ? 80 : 94
  // Pack the actual food silhouettes around one continuous bamboo stick.
  // Small overlaps hide the shaft between pieces without hiding their identity.
  const widths: Record<IngredientId, number> = { tomato: 66, pepper: 100, shrimp: 110, beef: 94, cheese: 86, bacon: 86 }
  const centers: number[] = []
  recipe.forEach((id, i) => centers.push(i ? centers[i - 1] + (widths[recipe[i - 1]] + widths[id]) / 2 - 9 : 84 + widths[id] / 2))
  const width = receipt ? Math.max(300, (centers.at(-1) ?? 160) + (widths[recipe.at(-1)!] ?? 0) / 2 + 42) : Math.max(460, recipe.length * spacing + 100)
  const height = receipt ? 126 + width * .157 : width * (angled ? .52 : 340 / 960), cy = height / 2 + 4
  const start = (width - (recipe.length - 1) * spacing) / 2
  const pieces = recipe.map((id, i) => `<g data-ingredient="${id}" data-index="${i}" ${receipt ? 'filter="url(#pieceShadow)"' : ''} transform="translate(${receipt ? centers[i] : start + i * spacing} ${cy}) rotate(${[0, -3, 2, -2][i % 4]})">${food[id]}</g>`).join('')
  const radius = receipt ? 6 : 4
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${receipt ? Math.round(height / width * 960) : angled ? 500 : 340}" viewBox="0 0 ${width} ${height}" data-recipe="${recipe.join(',')}">
    <defs>
      <radialGradient id="tomato" cx=".28" cy=".22" r=".85"><stop stop-color="#ff8b4f"/><stop offset=".42" stop-color="#ef4932"/><stop offset="1" stop-color="#b72724"/></radialGradient>
      <linearGradient id="pepper" x2=".3" y2="1"><stop stop-color="#bada58"/><stop offset=".55" stop-color="#8dbd36"/><stop offset="1" stop-color="#4e8c2e"/></linearGradient>
      <linearGradient id="shrimp" x2=".6" y2="1"><stop stop-color="#ffe3ae"/><stop offset=".5" stop-color="#ffbb86"/><stop offset="1" stop-color="#ef9261"/></linearGradient>
      <linearGradient id="beefTop" x2=".3" y2="1"><stop stop-color="#df9d58"/><stop offset="1" stop-color="#9b522b"/></linearGradient>
      <linearGradient id="beef" x2=".6" y2="1"><stop stop-color="#cc7b42"/><stop offset="1" stop-color="#87401f"/></linearGradient>
      <linearGradient id="cheese" x2=".5" y2="1"><stop stop-color="#ffdb68"/><stop offset="1" stop-color="#f1b63d"/></linearGradient>
      <linearGradient id="bacon" x2=".4" y2="1"><stop stop-color="#e88b70"/><stop offset="1" stop-color="#c55840"/></linearGradient>
      <linearGradient id="bamboo" x2="0" y2="1"><stop stop-color="#ffe3a0"/><stop offset=".45" stop-color="#ddb76b"/><stop offset="1" stop-color="#9d682f"/></linearGradient>
      <filter id="pieceShadow" x="-25%" y="-25%" width="150%" height="155%"><feDropShadow dx="-2" dy="3" stdDeviation="1.5" flood-color="#522515" flood-opacity=".28"/></filter>
      <filter id="foodShadow" x="-10%" y="-35%" width="120%" height="180%"><feDropShadow dx="1" dy="5" stdDeviation="2.5" flood-color="#65331f" flood-opacity=".24"/></filter>
    </defs>
    <g transform="rotate(${receipt ? -9 : angled ? -19 : -5} ${width / 2} ${cy})" filter="url(#foodShadow)">
      <path d="M20 ${cy - radius}H${width - 39}L${width - 13} ${cy}L${width - 39} ${cy + radius}H20Q15 ${cy}20 ${cy - radius}Z" fill="url(#bamboo)" stroke="#ad7c3c" stroke-width="1"/>
      ${receipt ? `<path d="M24 ${cy - 2}H${width - 42}" stroke="#fff0bc" stroke-width="2" opacity=".85"/><path d="M43 ${cy - 5}V${cy + 5}M49 ${cy - 5}V${cy + 5}" stroke="#a16c33" stroke-width="1.5" opacity=".55"/>` : ''}
      ${pieces}
    </g>
  </svg>`
}
