import { PaperPopup } from '../../tableLobby/PaperPopup'
import { focusParkCanvas } from '../../../world/inputOwnership'
import { closeWinterCommunity, useWinterCommunityPanel } from './panelState'
import './community.css'
import { TreeLetters } from './TreeLetters'

export function WinterCommunityPanels() {
  const kind = useWinterCommunityPanel(s => s.kind)
  if (!kind) return null
  return <PaperPopup title="온탑의 겨울" label="크리스마스 트리 편지" className="winter-community winter-tree-popup" closeLabel="겨울 이야기 닫기" onClose={() => { closeWinterCommunity(); focusParkCanvas() }}>
    <TreeLetters />
  </PaperPopup>
}
