import { createContext, useContext, useMemo, type PropsWithChildren } from 'react'
import { useFrame } from '@react-three/fiber'
import { AvatarFrame } from '../network/avatarFrame'
import { avatars, sampleAvatar, useSession } from '../network/worldClient'

const PoseFrame = createContext<AvatarFrame | null>(null)

export function AvatarPoseFrame({ children }: PropsWithChildren) {
  const frame = useMemo(() => new AvatarFrame(sampleAvatar,
    avatar => avatar === avatars.get(useSession.getState().sessionId)), [])
  useFrame(() => frame.begin(), -2)
  return <PoseFrame.Provider value={frame}>{children}</PoseFrame.Provider>
}

/** For useFrame presentation only. Events, HUD timers and physics keep sampleAvatar. */
export function useAvatarFrameSampler() {
  return useContext(PoseFrame)?.sample ?? sampleAvatar
}
