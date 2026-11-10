/** Local park opening plan. All paired bicycle/scooter rental points share the status. */
const closed=new Set(['folk','cafe','shooting','pigeon','fortune','fishing','dock','balloon'])
export const RENTALS_UNDER_CONSTRUCTION=true
export const underConstruction=(id:string)=>closed.has(id)||RENTALS_UNDER_CONSTRUCTION&&id.startsWith('mobility-')
export const constructionLabel=(_id:string,name:string)=>name
export const CONSTRUCTION_MESSAGE='시설을 준비하고 있어요. 공사가 끝나면 이용할 수 있어요.'
