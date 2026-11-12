// Presentation labels only: numeric server grades, art mapping and rewards stay unchanged.
export const capsuleTier=(grade:number)=>(['','S급','A급','B급','C급'][grade]??'')
export const capsuleName=(grade:number)=>grade===5?'엽전':`${capsuleTier(grade)} 캡슐`.trim()
export function displayGachaMessage(message:string){
 if(message==='새 뽑기 회차가 시작됐습니다. 뽑기권은 사용되지 않았습니다.')return '보상이 새로 채워졌어요. 뽑기권은 사용하지 않았어요.'
 if(message==='회차를 확인해주세요.')return '기계를 새로 확인해 주세요.'
 return message
}
/** Names of every set the current character can get from a capsule grade (the server picks one of them at random),
 * without the trailing "세트", in the server's order with repeats dropped. */
export function gradeProductNames(products:readonly {name:string;grade:number;compatibility:string}[],grade:number,gender:'MALE'|'FEMALE'){
 const names=products.filter(p=>p.grade===grade&&(p.compatibility==='ANY'||p.compatibility===gender)).map(p=>p.name.replace(/\s*세트$/,'').trim())
 return [...new Set(names)]
}
