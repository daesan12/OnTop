import {TABLES,JUMP_TABLES} from '../plan'
export const PAVILION_TARGETS:Record<string,string>={P0:'pavilion',P1:'rest-1',P2:'rest-4',P3:'rest-2',P4:'rest-3',P5:'island-pavilion'}
export const STONE_TABLE_TARGETS:Record<string,readonly[number,number]>={'table-1':TABLES[0]!,'table-2':TABLES[1]!,'table-3':TABLES[2]!,'table-4':TABLES[3]!,'table-14':TABLES[4]!,'table-15':TABLES[5]!,'table-16':JUMP_TABLES[0]!}
export const FACILITY_TARGETS:Record<string,string>={'garden-pagoda':'pagoda','reference-fountain':'fountain','fitness-garden':'fitness','spiral-observation-tower':'tower','vr-experience-hall':'vr','layout-hall-room':'folk','vr-stone-pagoda':'jump','fish-bread':'bread','feedback-mailbox':'mailbox','layout-drink':'lottery','layout-photo':'ranking'}
export const legacyIdsForSite=(id:string)=>Object.entries(FACILITY_TARGETS).filter(([,target])=>target===id).map(([key])=>key)
export const stoneTableIdAt=(x:number,z:number)=>Object.entries(STONE_TABLE_TARGETS).find(([,p])=>p[0]===x&&p[1]===z)?.[0]

export const pavilionIdForSite=(id:string)=>Object.entries(PAVILION_TARGETS).find(([,target])=>target===id)?.[0]
