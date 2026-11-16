import type { RankingDisplayColumn } from './service'
import { displayNickname } from '../gameMaster/displayName'
import { fitRankingText, rankingGlyph, rankingInk as ink } from './presentation'

type BoardPanelState = { title: string; column: RankingDisplayColumn | null; message: string; updatedAt: string; stale: boolean; page?: number }

function glyph(c: CanvasRenderingContext2D, kind: keyof typeof rankingGlyph, x: number, y: number, size: number) {
  c.save(); c.translate(x-size/2,y-size/2); c.scale(size/24,size/24)
  c.strokeStyle=ink.gold; c.lineWidth=1.4; c.lineCap='round'; c.lineJoin='round'
  c.stroke(new Path2D(rankingGlyph[kind])); c.restore()
}

export const drawRankingBoardPanel = ({ title, column, message, updatedAt, stale, page=0 }: BoardPanelState) =>
  (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle=ink.wood; c.fillRect(0,0,w,h)
    c.strokeStyle=ink.gold; c.lineWidth=w*.003; c.strokeRect(w*.012,h*.008,w*.976,h*.984)
    const paper=c.createLinearGradient(0,0,w,h)
    paper.addColorStop(0,'#fcf5df'); paper.addColorStop(1,'#eee3c8')
    c.fillStyle=paper; c.fillRect(w*.029,h*.019,w*.942,h*.962)
    // A quiet paper grain, generated once with the texture rather than every frame.
    c.strokeStyle='#a7956820'; c.lineWidth=.7
    for(let i=0;i<44;i++) { const y=h*(.025+i*.021); c.beginPath(); c.moveTo(w*.033,y); c.lineTo(w*.965,y+h*.001); c.stroke() }
    const header=h*.207
    c.fillStyle=ink.pine; c.beginPath(); c.roundRect(w*.045,h*.028,w*.91,header-h*.035,w*.018); c.fill()
    c.strokeStyle='#e5c78b80'; c.lineWidth=w*.0015
    c.beginPath(); c.arc(w/2,h*.068,h*.027,0,Math.PI*2); c.stroke()
    glyph(c,column?.key??'trophy',w/2,h*.068,h*.034)
    c.textAlign='center'; c.textBaseline='middle'; c.fillStyle=ink.cream
    c.font=`700 ${h*.036}px "Malgun Gothic",sans-serif`
    c.fillText(fitRankingText(c,column?.title??title,w*.84),w/2,h*.124)
    c.fillStyle='#d8ddc6'; c.font=`500 ${h*.017}px "Malgun Gothic",sans-serif`
    c.fillText(fitRankingText(c,column?.description??'공원의 최고 기록',w*.83),w/2,h*.171)
    c.fillStyle=ink.gold; c.fillRect(w*.07,header,w*.86,h*.002)

    if(!column||!column.rows.length) {
      glyph(c,'trophy',w/2,h*.48,h*.07)
      c.fillStyle=ink.muted; c.font=`500 ${h*.028}px "Malgun Gothic",sans-serif`
      c.fillText(fitRankingText(c,column?'아직 기록이 없습니다':message,w*.8),w/2,h*.56)
    } else {
      const rowHeight=h*.065
      for(let index=0;index<column.rows.length;index++) {
        const row=column.rows[index]!, top=h*.226+index*rowHeight, y=top+rowHeight/2
        const champion=row.rank===1, medal=row.rank<=3
        if(champion) {
          c.fillStyle='#35513e'; c.beginPath(); c.roundRect(w*.055,top,w*.89,rowHeight-h*.004,w*.012); c.fill()
          c.strokeStyle='#b59a5c'; c.lineWidth=w*.002; c.stroke()
        } else if(medal) { c.fillStyle='#eadebd'; c.fillRect(w*.055,top,w*.89,rowHeight-h*.004) }
        else { c.strokeStyle='#cfc1a078'; c.lineWidth=w*.001; c.beginPath(); c.moveTo(w*.075,top+rowHeight-h*.004); c.lineTo(w*.925,top+rowHeight-h*.004); c.stroke() }
        if(medal) {
          c.fillStyle=champion?'#d8b775':row.rank===2?'#d9ddcf':'#dfb58f'
          c.beginPath(); c.arc(w*.105,y,rowHeight*.24,0,Math.PI*2); c.fill()
          c.strokeStyle=champion?'#f7dfa2':row.rank===2?'#a0ab9d':'#b5855d'; c.lineWidth=w*.002; c.stroke()
        }
        c.textAlign='center'; c.fillStyle=champion?'#4a422a':medal?'#5e513a':ink.muted; c.font=`700 ${h*.027}px "Malgun Gothic",sans-serif`
        c.fillText(String(row.rank),w*.105,y)
        c.textAlign='left'; const nameInk=champion?ink.cream:'#42523e'
        c.fillStyle=nameInk
        if(row.members) {
          row.members.forEach((member,i)=> {
            const text=displayNickname(member,member.nickname), lineY=y+(i===0?-.19:.22)*rowHeight
            c.font=`600 ${h*.023}px "Malgun Gothic",sans-serif`
            const label=fitRankingText(c,text,w*(member.vr ? .32 : .42))
            c.fillText(label,w*.18,lineY)
            if(member.vr) {
              const x=w*.18+c.measureText(label).width+w*.014
              c.fillStyle=champion?'#e4ce96':ink.pine; c.beginPath(); c.roundRect(x,lineY-rowHeight*.13,w*.075,rowHeight*.26,w*.004); c.fill()
              c.fillStyle=champion?ink.pine:ink.cream; c.font=`700 ${h*.014}px sans-serif`; c.fillText('VR',x+w*.012,lineY)
              c.fillStyle=nameInk
            }
          })
        } else {
          c.font=`600 ${h*.028}px "Malgun Gothic",sans-serif`
          c.fillText(fitRankingText(c,displayNickname(row,row.nickname),w*.41),w*.18,y)
        }
        c.textAlign='right'; c.fillStyle=champion?'#f1d38f':ink.pine; c.font=`700 ${h*.029}px "Malgun Gothic",sans-serif`
        c.fillText(fitRankingText(c,row.value,w*.28),w*.922,y)
      }
    }
    c.strokeStyle='#bdab7f'; c.lineWidth=w*.0015; c.beginPath(); c.moveTo(w*.08,h*.92); c.lineTo(w*.92,h*.92); c.stroke()
    c.fillStyle=stale?'#976a30':ink.muted; c.font=`500 ${h*.019}px "Malgun Gothic",sans-serif`; c.textAlign='center'
    c.fillText(`${page+1} / 2  ·  ${stale?'이전 집계':updatedAt?`집계 ${updatedAt.slice(-5)}`:'E 자세히 보기'}`,w/2,h*.947)
  }

export const drawRankingTitle = (c: CanvasRenderingContext2D,w:number,h:number) => {
  c.fillStyle=ink.wood; c.fillRect(0,0,w,h)
  c.strokeStyle=ink.gold; c.lineWidth=h*.022; c.strokeRect(w*.018,h*.09,w*.964,h*.82)
  c.fillStyle=ink.cream; c.font=`700 ${h*.54}px "Malgun Gothic",sans-serif`; c.textAlign='center'; c.textBaseline='middle'
  c.save(); c.translate(w/2,h/2); c.scale(w/h/(3.02/.44),1); c.fillText('온탑 랭킹',0,0); c.restore()
  for(const x of [w*.085,w*.915]) { c.save(); c.translate(x,h/2); c.rotate(Math.PI/4); c.fillStyle=ink.gold; c.fillRect(-h*.04,-h*.04,h*.08,h*.08); c.restore() }
}
