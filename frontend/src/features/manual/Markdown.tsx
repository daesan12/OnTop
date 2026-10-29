import type { ReactNode } from 'react';

// Only our bundled rulebooks: React escapes all text. No HTML, remote links,
// images, scripts or user-provided Markdown are interpreted.
function inline(text:string):ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,i)=>part.startsWith('**') ? <strong key={i}>{part.slice(2,-2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1,-1)}</code> : part);
}
export function Markdown({text}:{text:string}) {
  const lines=text.replace(/\r\n/g,'\n').split('\n'), blocks:ReactNode[]=[];
  for(let i=0;i<lines.length;) {
    const line=lines[i]!.trim();
    if(!line){i++;continue;}
    if(line.startsWith('|') && /^\|[\s:|\-]+\|$/.test(lines[i+1]?.trim()??'')) {
      const cells=(s:string)=>s.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const headers=cells(line), rows:string[][]=[]; i+=2;
      while(lines[i]?.trim().startsWith('|')) rows.push(cells(lines[i++]!));
      blocks.push(<div className="manual-table-wrap" key={i}><table><thead><tr>{headers.map((h,k)=><th scope="col" key={k}>{inline(h)}</th>)}</tr></thead><tbody>{rows.map((row,k)=><tr key={k}>{row.map((c,j)=><td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if(/^#{1,6} /.test(line)){blocks.push(<h5 key={i}>{inline(line.replace(/^#{1,6} /,''))}</h5>);i++;continue;}
    if(/^\d+\. /.test(line)||/^[-*] /.test(line)) {
      const ordered=/^\d+\. /.test(line), items:ReactNode[]=[];
      const pattern=ordered?/^\d+\. /:/^[-*] /;
      while(lines[i]&&pattern.test(lines[i]!.trim())) items.push(<li key={i}>{inline(lines[i++]!.trim().replace(pattern,''))}</li>);
      blocks.push(ordered?<ol key={i}>{items}</ol>:<ul key={i}>{items}</ul>); continue;
    }
    if(line.startsWith('> ')){blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);i++;continue;}
    const paragraph=[line]; i++;
    while(lines[i]?.trim()&&!/^(#{1,6} |\d+\. |[-*>] |\|)/.test(lines[i]!.trim())) paragraph.push(lines[i++]!.trim());
    blocks.push(<p key={i}>{inline(paragraph.join(' '))}</p>);
  }
  return <>{blocks}</>;
}
