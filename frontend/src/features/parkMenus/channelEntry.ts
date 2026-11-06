import type { Channel } from '../../network/protocol'

const LAST_CHANNEL_PREFIX = 'ontop:park:last-channel:'

export function recommendedChannel(
  channels: readonly Channel[],
  preferredChannel = '',
  excludedChannel = '',
): Channel | undefined {
  const joinable = channels.filter(channel => channel.joinable)
  const preferred = joinable.find(channel => channel.channelId === preferredChannel
    && channel.channelId !== excludedChannel)
  if (preferred) return preferred

  const candidates = joinable.filter(channel => channel.channelId !== excludedChannel)
  return candidates.reduce<Channel | undefined>((best, channel) =>
    !best || channel.currentUsers < best.currentUsers ? channel : best, undefined)
}

function storageKey(userId: string) {
  return userId ? `${LAST_CHANNEL_PREFIX}${userId}` : ''
}

export function rememberedChannel(userId: string): string {
  const key = storageKey(userId)
  if (!key) return ''
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function rememberChannel(userId: string, channelId: string) {
  const key = storageKey(userId)
  if (!key || !channelId) return
  try {
    sessionStorage.setItem(key, channelId)
  } catch {
    // Storage can be disabled by browser privacy settings; channel entry still works.
  }
}
