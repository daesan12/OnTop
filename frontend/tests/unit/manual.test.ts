import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { useManual, openManual, closeManual, finishManualOpening, finishManualClosing, resetManual } from '../../src/features/manual/manualState';
import { inputState } from '../../src/world/inputOwnership';
import { filterManuals, gameManuals } from '../../src/features/manual/catalog';
import { rulebooks } from '../../src/features/manual/rulebooks';
import { Markdown } from '../../src/features/manual/Markdown';

beforeEach(()=>{vi.stubGlobal('window',new EventTarget()); useManual.setState({open:false,phase:'closed',page:'catalog'}); Object.keys(inputState).forEach(k=>inputState[k as keyof typeof inputState]=false);});
afterEach(()=>{resetManual(); vi.unstubAllGlobals();});
describe('M15 input ownership and stale transitions',()=>{
  it('locks immediately, rejects repeated opens, keeps other panels owned through closing, and clears held keys twice',()=>{
    let clears=0; window.addEventListener('ontop-clear-input',()=>clears++);
    inputState.chatOpen=true; inputState.minigameOpen=true;
    openManual('farkle'); openManual('onecard');
    expect(useManual.getState()).toMatchObject({page:'farkle',phase:'opening'}); expect(inputState.manualOpen).toBe(true);
    closeManual(); finishManualOpening();
    expect(useManual.getState().phase).toBe('closing'); expect(inputState.manualOpen).toBe(true);
    finishManualClosing(); finishManualOpening();
    expect(useManual.getState()).toMatchObject({open:false,phase:'closed'});
    expect(inputState).toMatchObject({manualOpen:false,chatOpen:true,minigameOpen:true}); expect(clears).toBe(2);
  });
  it('changing a chapter does not re-open the modal; session teardown releases the lock and cancels stale completion',()=>{
    openManual('gomoku'); finishManualOpening(); openManual('bridge');
    expect(useManual.getState()).toMatchObject({phase:'open',page:'bridge'});
    resetManual(); finishManualClosing(); finishManualOpening();
    expect(useManual.getState()).toMatchObject({phase:'closed',open:false}); expect(inputState.manualOpen).toBe(false);
  });
});
it('searches details across supported game/category boundaries without inventing later games',()=>{
  expect(gameManuals.map(g=>g.id)).toEqual(['gomoku','farkle','onecard','bridge','fish-bread']);
  expect(filterManuals('game','렌주 금수').map(g=>g.id)).toEqual(['gomoku']);
  expect(filterManuals('minigame','반죽').map(g=>g.id)).toEqual(['fish-bread']);
  expect(filterManuals('game','반죽')).toEqual([]);
});
it('publishes identical rulebook text and excludes the incompatible prototype timeout/free-rule policies',()=>{
  for (const [id,book] of Object.entries(rulebooks)) {
    expect(readFileSync(new URL(`../../public/rulebooks/${id}/v1.md`,import.meta.url),'utf8').trim()).toBe(book.markdown.trim());
    expect(book.markdown).not.toMatch(/차례 제한시간은 없|5초 안에 굴|12초 안에 선언|7초 경과|자유룰이에요/);
  }
  expect(rulebooks.gomoku.markdown).toContain('정확히 5개');
  expect(rulebooks.bridge.markdown).toContain('자동 굴림 없이');
  expect(rulebooks.farkle.markdown).toContain('이번 턴 점수만 잃고');
  expect(rulebooks.onecard.markdown).toContain('뽑기 더미로 돌려놓지');
});
it('renders trusted Markdown tables/lists/emphasis as escaped React text, including hostile HTML',()=>{
  const html=renderToStaticMarkup(createElement(Markdown,{text:'### 규칙\n\n1. **차례**를 확인\n2. `30초`\n\n| 카드 | 효과 |\n| --- | --- |\n| 2 | +2 |\n\n<img src=x onerror=alert(1)>\n\n> 기억해 주세요'}));
  expect(html).toContain('<table>'); expect(html).toContain('<ol>'); expect(html).toContain('<strong>차례</strong>');
  expect(html).toContain('&lt;img'); expect(html).not.toContain('<img'); expect(html).toContain('<blockquote>');
});
it('ships only optimized illustrations with verified integrity and original resolution',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../public/art/rulebooks/manifest.json',import.meta.url),'utf8'));
  expect(manifest.entries).toHaveLength(5);
  for (const entry of manifest.entries) {
    const bytes=readFileSync(new URL(`../../public/art/rulebooks/${entry.file}`,import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    expect(entry.bytes).toBeLessThan(entry.sourceBytes); expect(entry.width).toBe(1672); expect([940,941]).toContain(entry.height);
  }
});
