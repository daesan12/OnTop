import { create } from 'zustand'
import { clearRoamingInput } from '../../world/inputOwnership'

export const stoneRumbleGuideScope = ({ sessionId, roomId, mapVersion }: {
  sessionId: string; roomId: string; mapVersion: string
}) => JSON.stringify([sessionId, roomId, mapVersion])

export const useStoneRumbleGuide = create(() => ({ scope: '' }))

export function openStoneRumbleGuide(scope: string) {
  clearRoamingInput()
  useStoneRumbleGuide.setState({ scope })
}

export function closeStoneRumbleGuide() {
  useStoneRumbleGuide.setState({ scope: '' })
  clearRoamingInput()
}
